import AppLayout from './components/Layout/AppLayout';
import UploadPage from './components/Upload/UploadPage';
import ReconciliationGraph from './components/Graph/ReconciliationGraph';
import ReportPage from './components/Report/ReportPage';
import AIConfigPanel from './components/Settings/AIConfigPanel';
import MatchDetailPanel from './components/DetailPanel/MatchDetailPanel';
import useAppStore from './store/useAppStore';

export default function App() {
  const { activePage } = useAppStore();

  const renderPage = () => {
    switch (activePage) {
      case 'upload': return <UploadPage />;
      case 'graph': return <ReconciliationGraph />;
      case 'report': return <ReportPage />;
      case 'settings': return <AIConfigPanel />;
      default: return <UploadPage />;
    }
  };

  return (
    <AppLayout>
      {renderPage()}
      <MatchDetailPanel />
    </AppLayout>
  );
}
