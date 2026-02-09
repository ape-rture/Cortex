import { Layout } from "./components/layout";
import { route } from "./router";
import { ChatView } from "./views/chat";
import { DashboardView } from "./views/dashboard";
import { MonitorView } from "./views/monitor";
import { ReviewView } from "./views/review";

function CurrentView() {
  switch (route.value) {
    case "/dashboard":
      return <DashboardView />;
    case "/monitor":
      return <MonitorView />;
    case "/review":
      return <ReviewView />;
    case "/chat":
    default:
      return <ChatView />;
  }
}

export function App() {
  return (
    <Layout>
      <CurrentView />
    </Layout>
  );
}
