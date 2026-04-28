# CARE System Diagnostics

A comprehensive diagnostics plugin for the CARE platform that helps healthcare facility administrators verify system functionality, test hardware, and troubleshoot issues.

## Getting Started

### Prerequisites

- Node.js and npm (use the version required by this repository, as declared in `package.json` under `engines.node`)

### Setup Instructions

1. Setup both Care backend and frontend first before starting the `care_system_diagnostics` development server
2. Clone the CARE System Diagnostics repository:

```bash
git clone git@github.com:ohcnetwork/care_system_diagnostics.git
```

3. Install dependencies for CARE System Diagnostics:

```bash
cd care_system_diagnostics
npm install
```

4. Start the development server:

```bash
npm run start 
```

## Connect Plugin to Main `care_fe`

1. Open the main Care frontend.
2. Go to **Admin Dashboard** from the navbar.
3. Open **Apps** and click **Add New Config**.
4. Add the config below (for local development, the `url` should point to your local server):

```json
{
  "url": "http://localhost:10120/assets/remoteEntry.js",
  "name": "care_system_diagnostics",
  "plug": "care_system_diagnostics"
}
```

## Where to find the System Diagnostics Page

- Go to **Facility**.
- In the navbar, open **Settings**.
- In **Settings**, select **General**.
- On the **General** page, open the **Configuration** dropdown.
- Click **System Diagnostics** to open the page.

## Features

### **Printable Resources Check**

- Validates all logo resources (main, state, custom)
- Checks favicon and manifest files
- Measures load times and image dimensions
- Verifies file sizes

### **Print Templates Validation**

- Inspects facility-specific print templates
- Validates branding images (header, footer, logo)
- Checks page configuration (size, orientation)
- Verifies watermark and auto-print settings
- Reports total print-ready time

### **Network Diagnostics**

- API connectivity and latency testing
- Connection type detection (4G, 3G, etc.)
- Download/upload speed measurements
- Round-trip time (RTT) analysis
- Real-time network status monitoring

### **Plugins & Apps**

- Lists all loaded CARE plugins
- Validates remote entry accessibility
- Reports plugin load times
- Detects missing or misconfigured plugins

### **Backend Health Monitoring**

- Real-time health check for backend services
- Database connectivity status
- Cache service monitoring
- Celery queue length reporting
- Individual service latency metrics

### **Configuration Audit**

- API URL validation
- Sentry DSN configuration check
- reCAPTCHA setup verification
- Locale files availability
- Environment variables inspection

### **Media Device Testing**

- **Camera Detection**: Lists all available cameras with labels
- **Live Camera Preview**: Test camera feed with start/stop controls
- **Microphone Detection**: Identifies all audio input devices
- **Live Audio Level Meter**: Real-time microphone input visualization
- **Speaker Testing**: Audio playback test with voice synthesis
- **Permission Management**: Grant/request media device permissions

### **Printer Testing**

- Browser-based printer detection
- Color printing capability test
- Test page with color calibration blocks
- Inline print preview (no popup windows)
- Support for Chrome/Edge printer API

### **System Information**

- Browser user agent details
- Screen resolution and window size
- Device pixel ratio
- Timezone information
- Cookie and online status
- Service worker registration

The deployed plugin is available at [https://care-system-diagnostics.pages.dev/](https://care-system-diagnostics.pages.dev/)

