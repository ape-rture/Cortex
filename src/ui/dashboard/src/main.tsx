import { render } from "preact";
import { App } from "./app";
import "@xterm/xterm/css/xterm.css";
import "./dashboard.css";

render(<App />, document.getElementById("app")!);
