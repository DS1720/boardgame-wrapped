import { Composition } from 'remotion';
import { Wrapped } from './Wrapped';
import { VIDEO } from './config';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Wrapped"
    component={Wrapped}
    durationInFrames={VIDEO.fps * 3}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
    defaultProps={{ stats: null }}
  />
);
