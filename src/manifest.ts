import routes from "./routes";

const manifest = {
  plugin: "care-system-diagnostics",
  routes,
  extends: [],
  components: {},
  devices: [],
} as const;

export default manifest;
