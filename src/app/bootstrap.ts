import { BACKGROUND_COLOR, APP_NAME } from "./feature-flags";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("missing #app element");

document.title = APP_NAME;
appEl.style.background = BACKGROUND_COLOR;

appEl.innerHTML = `
  <div style="display:grid;place-items:center;height:100%;color:#F7F5EE;font-family:system-ui,sans-serif">
    <div style="text-align:center">
      <h1>Pencil AI</h1>
      <p>Living Line Adventure — bootstrap placeholder</p>
    </div>
  </div>
`;

console.log("[pencil-ai] client bootstrap loaded");
