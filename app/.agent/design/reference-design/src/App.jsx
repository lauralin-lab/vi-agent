import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CameraView from './components/CameraView';
import SessionView from './components/SessionView';
import HistoryView from './components/HistoryView';
import ProfileView from './components/ProfileView';
import DeviceFrame from './components/DeviceFrame';

function App() {
  const [viewState, setViewState] = useState('camera'); // 'camera', 'session', 'history', 'profile'
  const [sessionData, setSessionData] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Session counter for Done delay (PRD §7.3) + Guided First Shot (PRD §11.7)
  const [sessionCount, setSessionCount] = useState(() => {
    const saved = localStorage.getItem('vi_session_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  const handleCardTap = (data) => {
    // Increment session count
    const newCount = sessionCount + 1;
    setSessionCount(newCount);
    localStorage.setItem('vi_session_count', String(newCount));

    setSessionData(data);
    setViewState('session');
  };

  const handleBackToCamera = () => {
    setViewState('camera');
    setSessionData(null);
    setSelectedTemplate(null);
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setViewState('camera');
  };

  const handleOpenHistory = () => {
    setViewState('history');
  };

  const handleOpenProfile = () => {
    setViewState('profile');
  };

  const handleBackToHistory = () => {
    setViewState('history');
  };

  // Called when a use case is selected from HistoryView
  const handleSelectSession = (useCaseSessionData) => {
    setSessionData(useCaseSessionData);
    setViewState('session');
  };

  return (
    <DeviceFrame>
      <div className="relative w-full h-full bg-black font-sans select-none">
        <AnimatePresence mode="wait">
          {viewState === 'camera' && (
            <CameraView
              key="camera"
              onTapCard={handleCardTap}
              onOpenHistory={handleOpenHistory}
              sessionCount={sessionCount}
              isFirstTime={sessionCount === 0}
              selectedTemplate={selectedTemplate}
              onClearTemplate={() => setSelectedTemplate(null)}
            />
          )}
          {viewState === 'session' && (
            <SessionView
              key="session"
              data={sessionData}
              onBack={handleBackToCamera}
            />
          )}
          {viewState === 'history' && (
            <HistoryView
              key="history"
              onBack={handleBackToCamera}
              onSelectSession={handleSelectSession}
              onOpenProfile={handleOpenProfile}
              onSelectTemplate={handleSelectTemplate}
            />
          )}
          {viewState === 'profile' && (
            <ProfileView
              key="profile"
              onBack={handleBackToHistory}
            />
          )}
        </AnimatePresence>
      </div>
    </DeviceFrame>
  );
}

export default App;
