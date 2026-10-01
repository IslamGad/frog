import Frogger from './Frogger';
import { useExitOnRemoteBack } from './hooks/useExitOnRemoteBack';

export default function App() {
  useExitOnRemoteBack();
  return <Frogger />;
}
