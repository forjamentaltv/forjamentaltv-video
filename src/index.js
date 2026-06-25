import { registerRoot } from 'remotion';
import { ForjaMentalTV } from './ForjaMentalTV';
import { Composition } from 'remotion';

const Root = () => {
  return (
    <>
      <Composition
        id="ForjaMentalTV"
        component={ForjaMentalTV}
        durationInFrames={23400}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          audioUrl: '',
          guion: '',
          tema: '',
          episodio: '',
        }}
      />
    </>
  );
};

registerRoot(Root);
