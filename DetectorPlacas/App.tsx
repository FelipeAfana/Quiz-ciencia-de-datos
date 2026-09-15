import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// 🔧 Servidor por defecto: la app se conecta automáticamente a esta IP al abrir.
// El usuario puede cambiarla desde el panel de conexión (ícono de engranaje) si lo necesita.
const DEFAULT_IP = '44.222.36.131';
const DEFAULT_PORT = '8080';

const CAMERA_HEIGHT = 340;

export default function CameraScreen() {
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [ip, setIp] = useState(DEFAULT_IP);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [showSettings, setShowSettings] = useState(false);

  const [image, setImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [plates, setPlates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'original' | 'processed'>('original');

  const scanAnim = useRef(new Animated.Value(0)).current;

  const apiUrl = ip && port ? `http://${ip}:${port}` : '';

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    if (processedImage) setActiveView('processed');
  }, [processedImage]);

  // Línea de "escaneo" animada sobre la cámara mientras se analiza la imagen.
  useEffect(() => {
    if (loading) {
      scanAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        })
      );
      loop.start();
      return () => loop.stop();
    }
  }, [loading, scanAnim]);

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CAMERA_HEIGHT - 2],
  });

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (!ip) {
      Alert.alert('Falta configuración', 'Ingresa la dirección IP del servidor en el panel de conexión.');
      setShowSettings(true);
      return;
    }

    try {
      setLoading(true);
      const photo = await cameraRef.current.takePictureAsync({ base64: true });
      setImage(photo.uri);
      setPlates([]);
      setProcessedImage(null);
      setActiveView('original');

      const fullUrl = `${apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl}/predict_json/`;
      console.log('📤 Enviando imagen base64 a:', fullUrl);

      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          image_base64: photo.base64,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('❌ Error HTTP:', response.status, text);
        Alert.alert('Error HTTP', `Código: ${response.status}`);
        Speech.speak('Ocurrió un error al contactar el servidor.');
        return;
      }

      const data = await response.json();
      console.log('📥 Respuesta del servidor:', data);

      if (data?.placas && data.placas.length > 0) {
        const detected = data.placas;
        setPlates(detected);

        if (data.image) {
          setProcessedImage(`data:image/jpeg;base64,${data.image}`);
        }

        const textToSpeak =
          detected.length === 1
            ? `La placa detectada es ${detected[0].split('').join(' ')}`
            : `Se detectaron ${detected.length} placas: ${detected.join(', ')}`;

        if (Platform.OS !== 'web') {
          Speech.speak(textToSpeak, { language: 'es-ES' });
        }
      } else if (data?.placas?.length === 0) {
        if (Platform.OS !== 'web') Speech.speak('No se detectaron placas.');
        Alert.alert('Resultado', 'No se detectaron placas.');
        setPlates([]);
        setProcessedImage(null);
      } else if (data?.error) {
        Alert.alert('Error del servidor', data.error);
        if (Platform.OS !== 'web') Speech.speak('Ocurrió un error en el servidor.');
      } else {
        console.warn('⚠️ Respuesta inesperada:', data);
        Alert.alert('Respuesta inesperada', JSON.stringify(data));
      }
    } catch (error) {
      console.error('❌ Error enviando imagen:', error);
      Alert.alert('Error', 'No se pudo conectar al servidor.');
      if (Platform.OS !== 'web') Speech.speak('No se pudo conectar al servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setProcessedImage(null);
    setPlates([]);
    setActiveView('original');
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.amber} />
        <Text style={styles.centeredText}>Solicitando permisos de cámara…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="camera-outline" size={56} color={COLORS.blue} />
        <Text style={styles.centeredTitle}>Se necesita acceso a la cámara</Text>
        <Text style={styles.centeredText}>
          Esta app usa la cámara para capturar y reconocer placas vehiculares.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Conceder permiso</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Lector de placas</Text>
          <View style={styles.connectionRow}>
            <View style={[styles.dot, { backgroundColor: ip ? COLORS.green : COLORS.red }]} />
            <Text style={styles.connectionText}>{ip ? `${ip}:${port}` : 'Sin configurar'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setShowSettings((s) => !s)} style={styles.settingsButton}>
          <Ionicons name={showSettings ? 'close' : 'settings-outline'} size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showSettings && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.settingsPanel}>
              <Text style={styles.panelTitle}>Conexión al servidor</Text>

              <Text style={styles.inputLabel}>Dirección IP</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 44.222.36.131"
                placeholderTextColor={COLORS.textMuted}
                value={ip}
                onChangeText={setIp}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Puerto</Text>
              <TextInput
                style={styles.input}
                placeholder="8080"
                placeholderTextColor={COLORS.textMuted}
                value={port}
                onChangeText={setPort}
                keyboardType="numeric"
              />

              <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowSettings(false)}>
                <Text style={styles.secondaryButtonText}>Guardar y cerrar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        <View style={styles.cameraPanel}>
          <View style={styles.cameraWrapper}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
            <View pointerEvents="none" style={styles.plateGuide} />
            {loading && (
              <Animated.View
                pointerEvents="none"
                style={[styles.scanLine, { transform: [{ translateY: scanTranslateY }] }]}
              />
            )}
            <Text pointerEvents="none" style={styles.guideHint}>
              Alinea la placa dentro del marco
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.captureButton, loading && styles.captureButtonDisabled]}
            onPress={handleCapture}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Ionicons name="camera" size={26} color={COLORS.bg} />
            )}
          </TouchableOpacity>
        </View>
        {loading && <Text style={styles.loadingText}>Analizando imagen…</Text>}

        {(image || processedImage) && (
          <View style={styles.panel}>
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setActiveView('original')}
                style={[styles.tab, activeView === 'original' && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeView === 'original' && styles.tabTextActive]}>
                  Capturada
                </Text>
              </Pressable>
              <Pressable
                onPress={() => processedImage && setActiveView('processed')}
                disabled={!processedImage}
                style={[styles.tab, activeView === 'processed' && styles.tabActive]}
              >
                <Text
                  style={[
                    styles.tabText,
                    activeView === 'processed' && styles.tabTextActive,
                    !processedImage && styles.tabTextDisabled,
                  ]}
                >
                  Procesada
                </Text>
              </Pressable>
            </View>

            {activeView === 'original' && image && (
              <Image source={{ uri: image }} style={styles.previewImage} resizeMode="contain" />
            )}
            {activeView === 'processed' && processedImage && (
              <Image source={{ uri: processedImage }} style={styles.previewImage} resizeMode="contain" />
            )}

            <TouchableOpacity style={styles.linkButton} onPress={handleReset}>
              <Ionicons name="refresh" size={16} color={COLORS.blue} />
              <Text style={styles.linkButtonText}>Tomar otra foto</Text>
            </TouchableOpacity>
          </View>
        )}

        {plates.length > 0 && (
          <View style={styles.resultsPanel}>
            <Text style={styles.resultsTitle}>
              {plates.length === 1 ? 'Placa detectada' : `${plates.length} placas detectadas`}
            </Text>
            {plates.map((p, i) => (
              <View key={i} style={styles.plateBadge}>
                <Text style={styles.plateBadgeCountry}>COLOMBIA</Text>
                <Text style={styles.plateBadgeText}>{p}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const COLORS = {
  bg: '#0B1120',
  panel: '#141B2E',
  panelDeep: '#0A0F1A',
  border: '#1E293B',
  text: '#F1F5F9',
  textMuted: '#94A3B8',
  amber: '#FBBF24',
  blue: '#38BDF8',
  green: '#34D399',
  red: '#F87171',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.bg,
    gap: 8,
  },
  centeredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    textAlign: 'center',
  },
  centeredText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.text,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connectionText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsPanel: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  panel: {
    backgroundColor: COLORS.panel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    height: 44,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  secondaryButton: {
    marginTop: 16,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.blue,
    fontWeight: '700',
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: COLORS.bg,
    fontWeight: '800',
    fontSize: 14,
  },
  cameraPanel: {
    marginBottom: 30,
  },
  cameraWrapper: {
    width: '100%',
    height: CAMERA_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  camera: {
    width: '100%',
    height: '100%',
  },
  plateGuide: {
    position: 'absolute',
    top: '38%',
    left: '10%',
    right: '10%',
    height: '18%',
    borderWidth: 2,
    borderColor: 'rgba(251,191,36,0.85)',
    borderRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.amber,
    shadowColor: COLORS.amber,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  guideHint: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: COLORS.text,
    fontSize: 12,
    backgroundColor: 'rgba(11,17,32,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  captureButton: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -26,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.amber,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  captureButtonDisabled: {
    backgroundColor: '#7C6423',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: -18,
    marginBottom: 20,
    color: COLORS.textMuted,
    fontSize: 13,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.panelDeep,
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.border,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.text,
  },
  tabTextDisabled: {
    color: '#3B4657',
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 10,
    backgroundColor: COLORS.panelDeep,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
  },
  linkButtonText: {
    color: COLORS.blue,
    fontWeight: '600',
    fontSize: 13,
  },
  resultsPanel: {
    backgroundColor: COLORS.panelDeep,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  plateBadge: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#0F172A',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  plateBadgeCountry: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 2,
  },
  plateBadgeText: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});