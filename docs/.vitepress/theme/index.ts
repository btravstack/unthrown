import Theme from "@btravstack/theme";

import "./custom.css";
import { setupVersionSwitch } from "./version-switch.js";

// Same-page, same-tab switching for the docs version dropdown (no-op in SSR
// and on single-version deploys, where no version links exist to intercept).
setupVersionSwitch();

export default Theme;
