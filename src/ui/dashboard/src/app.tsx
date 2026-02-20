import { Layout } from "./components/layout";
import { route } from "./router";
import { ChatView } from "./views/chat";
import { DashboardView } from "./views/dashboard";
import { MonitorView } from "./views/monitor";
import { ProjectsView } from "./views/projects";
import { ReviewView } from "./views/review";
import { CapturesView } from "./views/captures";
import { WorkspacesView } from "./views/workspaces";

function CurrentView() {
  switch (route.value) {
    case "/dashboard":
      return <DashboardView />;
    case "/monitor":
      return <MonitorView />;
    case "/review":
      return <ReviewView />;
    case "/captures":
      return <CapturesView />;
    case "/projects":
      return <ProjectsView />;
    case "/workspaces":
      return <WorkspacesView />;
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
