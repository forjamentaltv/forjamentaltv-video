import { AbsoluteFill, Audio, Sequence, useVideoConfig, interpolate, useCurrentFrame } from 'remotion';

export const ForjaMentalTV = ({ audioUrl, tema, episodio }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1]);
  const fadeOut = interpolate(frame, [durationInFrames - 60, durationInFrames], [1, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>

      {/* Audio de Gael */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* Fondo oscuro cinematográfico */}
      <AbsoluteFill style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
      }} />

      {/* Logo / Marca */}
      <Sequence from={0} durationInFrames={90}>
        <AbsoluteFill style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity,
        }}>
          <div style={{
            color: '#c9a84c',
            fontSize: 32,
            fontFamily: 'serif',
            letterSpacing: 8,
            textTransform: 'uppercase',
          }}>
            FORJA MENTAL TV
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Título del episodio */}
      <Sequence from={90}>
        <AbsoluteFill style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: 120,
          opacity: fadeOut,
        }}>
          <div style={{
            color: '#ffffff',
            fontSize: 64,
            fontFamily: 'serif',
            textAlign: 'center',
            lineHeight: 1.3,
            textShadow: '0 0 40px rgba(201,168,76,0.3)',
          }}>
            {tema}
          </div>
          <div style={{
            color: '#c9a84c',
            fontSize: 24,
            fontFamily: 'sans-serif',
            marginTop: 40,
            letterSpacing: 4,
          }}>
            Episodio {episodio}
          </div>
        </AbsoluteFill>
      </Sequence>

    </AbsoluteFill>
  );
};
