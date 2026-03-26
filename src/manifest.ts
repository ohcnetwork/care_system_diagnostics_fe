import { lazy } from "react";
import routes from "./routes";

const manifest = {
  plugin: "care_system_diagnostics",
  routes,
  extends: [],
  components: {
    FacilityHomeActions: lazy(
      () => import("./components/DiagnosticsNavigationButton"),
    ),
  },
  devices: [],
} as const;

export default manifest;
