# CARE System Diagnostics

A comprehensive diagnostics plugin for the CARE platform that helps healthcare facility administrators verify system functionality, test hardware, and troubleshoot issues.

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



