import careConfig from "@/lib/careConfig";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ActivityIcon,
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  ChevronLeft,
  ClockIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  InfoIcon,
  LayoutTemplateIcon,
  LockIcon,
  MicIcon,
  MonitorIcon,
  PlayIcon,
  PlugIcon,
  PrinterIcon,
  RefreshCwIcon,
  ServerIcon,
  SquareIcon,
  VideoIcon,
  Volume2Icon,
  WifiIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useCareApps } from "@/hooks/useCareApps";
import facilityApi from "@/lib/types/facility/facilityApi";
import { query } from "@/lib/request";

type ResourceStatus = "loading" | "success" | "partial" | "error";

interface DiagnosticResult {
  name: string;
  status: ResourceStatus;
  details?: string;
  duration?: number;
}

interface NetworkDiagnostics {
  latency: number | null;
  apiReachable: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  downloadSpeed?: number;
}

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

interface HealthCheckItem {
  name: string;
  title: string;
  code: number;
  message: string;
  latency: number;
  meta?: Record<string, unknown>;
}

interface HealthCheckResponse {
  health: HealthCheckItem[];
}

function StatusIcon({ status }: { status: ResourceStatus }) {
  switch (status) {
    case "success":
      return <CheckCircle2Icon className="size-5 text-green-600" />;
    case "partial":
      return <AlertTriangleIcon className="size-5 text-yellow-600" />;
    case "error":
      return <XCircleIcon className="size-5 text-red-600" />;
    case "loading":
    default:
      return <RefreshCwIcon className="size-5 animate-spin text-gray-400" />;
  }
}

function statusBadgeVariant(
  status: ResourceStatus,
): "green" | "yellow" | "destructive" | "secondary" {
  switch (status) {
    case "success":
      return "green";
    case "partial":
      return "yellow";
    case "error":
      return "destructive";
    default:
      return "secondary";
  }
}

function statusLabel(
  status: ResourceStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "success":
      return t("checked");
    case "partial":
      return t("partial");
    case "error":
      return t("failed");
    default:
      return t("checking");
  }
}

async function checkImageResource(
  url: string,
  name: string,
  t: (key: string) => string,
): Promise<DiagnosticResult> {
  const start = performance.now();

  // Try to get file size via a HEAD request in parallel
  const sizePromise = fetch(url, { method: "HEAD", cache: "no-cache" })
    .then((resp) => {
      const cl = resp.headers.get("content-length");
      return cl ? Number(cl) : null;
    })
    .catch(() => null);

  return new Promise<DiagnosticResult>((resolve) => {
    const img = new Image();
    img.onload = async () => {
      const bytes = await sizePromise;
      const sizeStr = bytes ? formatBytes(bytes) : null;
      const parts = [`${img.naturalWidth}×${img.naturalHeight}`];
      if (sizeStr) parts.push(sizeStr);
      resolve({
        name,
        status: "success",
        details: parts.join(", "),
        duration: Math.round(performance.now() - start),
      });
    };
    img.onerror = () =>
      resolve({
        name,
        status: "error",
        details: t("image_failed_to_load"),
        duration: Math.round(performance.now() - start),
      });
    img.src = url;
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function checkFetchResource(
  url: string,
  name: string,
  t: (key: string) => string,
): Promise<DiagnosticResult> {
  const start = performance.now();
  try {
    const resp = await fetch(url, { method: "HEAD", cache: "no-cache" });
    return {
      name,
      status: resp.ok ? "success" : "partial",
      details: `HTTP ${resp.status}`,
      duration: Math.round(performance.now() - start),
    };
  } catch {
    return {
      name,
      status: "error",
      details: t("network_error"),
      duration: Math.round(performance.now() - start),
    };
  }
}

async function measureDownloadSpeed(): Promise<number | undefined> {
  // Download a known static asset and measure throughput
  const testUrls = ["/manifest.webmanifest", "/robots.txt", "/favicon.ico"];

  try {
    // Run multiple downloads to get a better average
    let totalBytes = 0;
    const start = performance.now();

    for (const url of testUrls) {
      const cacheBust = `${url}?_speedtest=${Date.now()}`;
      const resp = await fetch(cacheBust, { cache: "no-store" });
      if (resp.ok) {
        const blob = await resp.blob();
        totalBytes += blob.size;
      }
    }

    const durationSec = (performance.now() - start) / 1000;

    if (totalBytes > 0 && durationSec > 0) {
      // Convert bytes/sec to Mbps (megabits per second)
      return parseFloat(
        ((totalBytes * 8) / durationSec / 1_000_000).toFixed(2),
      );
    }
  } catch {
    // Speed test failed silently
  }
  return undefined;
}

async function measureApiLatency(apiUrl: string): Promise<NetworkDiagnostics> {
  let latency: number | null = null;
  let apiReachable = false;

  try {
    const start = performance.now();
    const resp = await fetch(apiUrl, { method: "HEAD", cache: "no-cache" });
    latency = Math.round(performance.now() - start);
    apiReachable = resp.ok || resp.status === 401 || resp.status === 403;
  } catch {
    apiReachable = false;
  }

  const connection = (navigator as NavigatorWithConnection).connection;
  const downloadSpeed = await measureDownloadSpeed();

  return {
    latency,
    apiReachable,
    effectiveType: connection?.effectiveType,
    downlink: connection?.downlink,
    rtt: connection?.rtt,
    downloadSpeed,
  };
}

async function checkMediaDevices(
  t: (key: string) => string,
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [
      {
        name: t("camera"),
        status: "error",
        details: t("media_device_error"),
      },
      {
        name: t("microphone"),
        status: "error",
        details: t("media_device_error"),
      },
    ];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    // If labels are populated, permission was already granted
    const hasLabels = devices.some((d) => d.label.length > 0);

    // --- Cameras ---
    const cameras = devices.filter((d) => d.kind === "videoinput");
    if (cameras.length > 0) {
      if (hasLabels) {
        for (const cam of cameras) {
          const label = cam.label || `Camera ${cameras.indexOf(cam) + 1}`;
          results.push({
            name: `${t("camera")}: ${label}`,
            status: "success",
            details: t("camera_available"),
          });
        }
      } else {
        results.push({
          name: `${t("camera")} (×${cameras.length})`,
          status: "partial",
          details: t("camera_detected_no_permission"),
        });
      }
    } else {
      results.push({
        name: t("camera"),
        status: "error",
        details: t("camera_not_found"),
      });
    }

    // --- Microphones ---
    const microphones = devices.filter((d) => d.kind === "audioinput");
    if (microphones.length > 0) {
      if (hasLabels) {
        for (const mic of microphones) {
          const label =
            mic.label || `Microphone ${microphones.indexOf(mic) + 1}`;
          results.push({
            name: `${t("microphone")}: ${label}`,
            status: "success",
            details: t("microphone_available"),
          });
        }
      } else {
        results.push({
          name: `${t("microphone")} (×${microphones.length})`,
          status: "partial",
          details: t("microphone_detected_no_permission"),
        });
      }
    } else {
      results.push({
        name: t("microphone"),
        status: "error",
        details: t("microphone_not_found"),
      });
    }

    // --- Speakers / Audio Output ---
    const speakers = devices.filter((d) => d.kind === "audiooutput");
    if (speakers.length > 0) {
      if (hasLabels) {
        for (const spk of speakers) {
          const label = spk.label || `Speaker ${speakers.indexOf(spk) + 1}`;
          results.push({
            name: `${t("speaker")}: ${label}`,
            status: "success",
            details: t("speaker_available"),
          });
        }
      } else {
        results.push({
          name: `${t("speaker")} (×${speakers.length})`,
          status: "partial",
          details: t("speaker_detected_no_permission"),
        });
      }
    } else {
      results.push({
        name: t("speaker"),
        status: "partial",
        details: t("speaker_not_found"),
      });
    }

    // Show permission prompt row only when labels aren't available
    if (!hasLabels && (cameras.length > 0 || microphones.length > 0)) {
      results.push({
        name: t("media_permission_denied"),
        status: "partial",
        details: t("media_permission_denied_desc"),
      });
    }
  } catch {
    results.push({
      name: t("camera"),
      status: "error",
      details: t("media_device_error"),
    });
    results.push({
      name: t("microphone"),
      status: "error",
      details: t("media_device_error"),
    });
  }

  return results;
}

export default function SystemDiagnosticsPage({
  facilityId,
}: {
  facilityId: string;
}) {
  const { t } = useTranslation();
  const { apps: careApps, isLoading: _careAppsLoading } = useCareApps();
  const queryClient = useQueryClient();
  const [runKey, setRunKey] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null);

  const rerunAll = useCallback(() => setRunKey((k) => k + 1), []);

  // Refresh only the media device detection (doesn't restart everything)
  const refreshMediaDevices = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["diagnostics-media"] });
  }, [queryClient]);

  const printableResourceChecks = useMemo(
    () => [
      {
        name: t("main_logo"),
        url: careConfig.mainLogo?.dark ?? "/images/care_logo.svg",
        type: "image" as const,
      },
      {
        name: t("main_logo_light"),
        url: careConfig.mainLogo?.light ?? "/images/care_logo.svg",
        type: "image" as const,
      },
      ...(careConfig.stateLogo
        ? [
            {
              name: t("state_logo"),
              url: careConfig.stateLogo.dark,
              type: "image" as const,
            },
          ]
        : []),
      ...(careConfig.customLogo
        ? [
            {
              name: t("custom_logo"),
              url: careConfig.customLogo.dark,
              type: "image" as const,
            },
          ]
        : []),
      {
        name: t("favicon"),
        url: "/favicon.ico",
        type: "fetch" as const,
      },
      {
        name: t("manifest"),
        url: "/manifest.webmanifest",
        type: "fetch" as const,
      },
    ],
    // runKey forces recalculation on rerun
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runKey, t],
  );

  const { data: printResults, isLoading: printLoading } = useQuery({
    queryKey: ["diagnostics-print", runKey],
    queryFn: () =>
      Promise.all(
        printableResourceChecks.map((r) =>
          r.type === "image"
            ? checkImageResource(r.url, r.name, t)
            : checkFetchResource(r.url, r.name, t),
        ),
      ),
  });

  const { data: networkResult, isLoading: networkLoading } = useQuery({
    queryKey: ["diagnostics-network", runKey],
    queryFn: () => measureApiLatency(careConfig.apiUrl),
  });

  // Backend Health Check
  const { data: healthResult, isLoading: healthLoading } = useQuery<
    DiagnosticResult[]
  >({
    queryKey: ["diagnostics-health", runKey],
    queryFn: async (): Promise<DiagnosticResult[]> => {
      const start = performance.now();
      try {
        const resp = await fetch(`${careConfig.apiUrl}/health/`, {
          method: "GET",
          cache: "no-cache",
        });
        const totalDuration = Math.round(performance.now() - start);

        if (!resp.ok) {
          return [
            {
              name: t("backend_health"),
              status: "error",
              details: `HTTP ${resp.status}`,
              duration: totalDuration,
            },
          ];
        }

        const data = (await resp.json()) as HealthCheckResponse;
        const results: DiagnosticResult[] = [];

        for (const check of data.health) {
          // Build details string from API response
          let details = check.message;

          // Add queue length if present (for Celery queue)
          if (check.meta?.queue_length !== undefined) {
            details += ` (Queue: ${check.meta.queue_length})`;
          }

          results.push({
            name: check.name,
            status: check.code === 200 ? "success" : "error",
            details,
            duration: Math.round(check.latency * 1000),
          });
        }

        return results;
      } catch (error) {
        return [
          {
            name: t("backend_health"),
            status: "error",
            details: error instanceof Error ? error.message : t("check_failed"),
            duration: Math.round(performance.now() - start),
          },
        ];
      }
    },
  });

  const configResults = useMemo<DiagnosticResult[]>(() => {
    const results: DiagnosticResult[] = [];

    results.push({
      name: t("api_url"),
      status: careConfig.apiUrl ? "success" : "error",
      details: careConfig.apiUrl || t("not_configured"),
    });

    results.push({
      name: t("sentry_dsn"),
      status: careConfig.sentry?.dsn ? "success" : "partial",
      details: careConfig.sentry?.dsn ? t("configured") : t("not_configured"),
    });

    results.push({
      name: t("recaptcha"),
      status: careConfig.reCaptchaSiteKey ? "success" : "partial",
      details: careConfig.reCaptchaSiteKey
        ? t("configured")
        : t("not_configured"),
    });

    results.push({
      name: t("locale_files"),
      status:
        careConfig.availableLocales && careConfig.availableLocales.length > 0
          ? "success"
          : "partial",
      details: careConfig.availableLocales?.join(", ") || "en",
    });

    return results;
    // runKey forces recalculation on rerun
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, t]);

  const pluginResults = useMemo<DiagnosticResult[]>(() => {
    if (!careApps || careApps.length === 0) {
      return [
        {
          name: t("plugins"),
          status: "partial" as const,
          details: t("no_plugins_loaded"),
        },
      ];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return careApps.map((app: any) => ({
      name: app.slug,
      status: "loading" as const,
      details: app.meta?.url || t("url_not_configured"),
    }));
    // runKey forces recalculation on rerun
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careApps, runKey, t]);

  // Check plugin remote entry accessibility
  const { data: pluginCheckResults, isLoading: pluginsLoading } = useQuery({
    queryKey: ["diagnostics-plugins", runKey, pluginResults],
    queryFn: async () => {
      if (!careApps || careApps.length === 0) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const checks = careApps.map(async (app: any) => {
        const url = app.meta?.url;
        if (!url) {
          return {
            name: app.slug,
            status: "partial" as const,
            details: t("url_not_configured"),
          };
        }

        const start = performance.now();
        try {
          const resp = await fetch(url, {
            method: "HEAD",
            cache: "no-cache",
          });
          const duration = Math.round(performance.now() - start);

          // 200 (OK) or 304 (Not Modified) both indicate plugin is accessible
          if (resp.ok || resp.status === 304) {
            return {
              name: app.slug,
              status: "success" as const,
              details: `${url} (HTTP ${resp.status})`,
              duration,
            };
          }

          return {
            name: app.slug,
            status: "error" as const,
            details: `${url} (HTTP ${resp.status})`,
            duration,
          };
        } catch (error) {
          return {
            name: app.slug,
            status: "error" as const,
            details: `${url} - ${error instanceof Error ? error.message : t("unreachable")}`,
            duration: Math.round(performance.now() - start),
          };
        }
      });

      return Promise.all(checks);
    },
  });

  const mergedPluginResults = useMemo<DiagnosticResult[]>(() => {
    if (!pluginCheckResults) return pluginResults;
    return pluginCheckResults;
  }, [pluginResults, pluginCheckResults]);

  const { data: swResult, isLoading: swLoading } = useQuery({
    queryKey: ["diagnostics-sw", runKey],
    queryFn: async (): Promise<DiagnosticResult> => {
      if (!("serviceWorker" in navigator)) {
        return {
          name: t("service_worker"),
          status: "partial",
          details: t("not_supported"),
        };
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return {
          name: t("service_worker"),
          status: reg ? "success" : "partial",
          details: reg
            ? `${t("registered")} (${reg.active ? t("active") : t("waiting")})`
            : t("not_registered"),
        };
      } catch {
        return {
          name: t("service_worker"),
          status: "error",
          details: t("check_failed"),
        };
      }
    },
  });

  // Camera, Microphone & Speaker detection
  const { data: mediaDeviceResults, isLoading: mediaLoading } = useQuery<
    DiagnosticResult[]
  >({
    queryKey: ["diagnostics-media", runKey],
    queryFn: () => checkMediaDevices(t),
  });

  // Fetch the facility details to get print_templates
  const { data: facilityData, isLoading: facilityLoading } = useQuery({
    queryKey: ["diagnostics-facility", facilityId, runKey],
    queryFn: query(facilityApi.get, {
      pathParams: { facilityId },
    }),
  });

  const printTemplateResults = useMemo<DiagnosticResult[]>(() => {
    const results: DiagnosticResult[] = [];

    if (!facilityData) return results;

    const templates = Array.isArray(facilityData.print_templates)
      ? facilityData.print_templates
      : [];

    if (templates.length === 0) {
      results.push({
        name: facilityData.name,
        status: "partial",
        details: t("no_templates"),
      });
      return results;
    }

    for (const tmpl of templates) {
      const prefix = `${facilityData.name} › ${tmpl.slug}`;

      // Check branding header image
      if (tmpl.branding?.header_image?.url) {
        results.push({
          name: `${prefix} — ${t("header_image")}`,
          status: "loading",
          details: tmpl.branding.header_image.url,
        });
      }

      // Check branding footer image
      if (tmpl.branding?.footer_image?.url) {
        results.push({
          name: `${prefix} — ${t("footer_image")}`,
          status: "loading",
          details: tmpl.branding.footer_image.url,
        });
      }

      // Check branding logo
      if (tmpl.branding?.logo?.url) {
        results.push({
          name: `${prefix} — ${t("template_logo")}`,
          status: "loading",
          details: tmpl.branding.logo.url,
        });
      }

      // Page config
      if (tmpl.page) {
        const pageDetails = [
          tmpl.page.size ?? "A4",
          tmpl.page.orientation ?? "portrait",
        ].join(", ");
        results.push({
          name: `${prefix} — ${t("page_config")}`,
          status: "success",
          details: pageDetails,
        });
      }

      // Watermark config
      if (tmpl.watermark) {
        results.push({
          name: `${prefix} — ${t("watermark")}`,
          status: tmpl.watermark.enabled ? "success" : "partial",
          details: tmpl.watermark.enabled
            ? `${tmpl.watermark.text ?? ""} (${tmpl.watermark.opacity ?? 0.1})`
            : t("disabled"),
        });
      }

      // Auto-print config
      if (tmpl.print_setup) {
        results.push({
          name: `${prefix} — ${t("auto_print")}`,
          status: "success",
          details: tmpl.print_setup.auto_print ? t("enabled") : t("disabled"),
        });
      }

      // If template has no branding, page, or watermark at all
      if (
        !tmpl.branding &&
        !tmpl.page &&
        !tmpl.watermark &&
        !tmpl.print_setup
      ) {
        results.push({
          name: prefix,
          status: "partial",
          details: t("template_unconfigured"),
        });
      }
    }

    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityData, runKey, t]);

  // Async image checks for print template branding resources
  const { data: templateImageResults, isLoading: _templateImagesLoading } =
    useQuery({
      queryKey: ["diagnostics-template-images", runKey, printTemplateResults],
      queryFn: async () => {
        if (!facilityData) return [];
        const templates = Array.isArray(facilityData.print_templates)
          ? facilityData.print_templates
          : [];

        const allResults: DiagnosticResult[] = [];

        for (const tmpl of templates) {
          const prefix = `${facilityData.name} › ${tmpl.slug}`;
          const imageChecks: Promise<DiagnosticResult>[] = [];

          if (tmpl.branding?.header_image?.url) {
            imageChecks.push(
              checkImageResource(
                tmpl.branding.header_image.url,
                `${prefix} — ${t("header_image")}`,
                t,
              ),
            );
          }
          if (tmpl.branding?.footer_image?.url) {
            imageChecks.push(
              checkImageResource(
                tmpl.branding.footer_image.url,
                `${prefix} — ${t("footer_image")}`,
                t,
              ),
            );
          }
          if (tmpl.branding?.logo?.url) {
            imageChecks.push(
              checkImageResource(
                tmpl.branding.logo.url,
                `${prefix} — ${t("template_logo")}`,
                t,
              ),
            );
          }

          if (imageChecks.length > 0) {
            // Load all images for this template in parallel (like PrintPreview does)
            const totalStart = performance.now();
            const results = await Promise.all(imageChecks);
            const totalDuration = Math.round(performance.now() - totalStart);
            allResults.push(...results);

            // Add a summary row showing total print readiness time for this template
            const allLoaded = results.every((r) => r.status === "success");
            allResults.push({
              name: `${prefix} — ${t("print_ready_time")}`,
              status: allLoaded ? "success" : "error",
              details: allLoaded
                ? t("all_resources_loaded")
                : t("some_resources_failed"),
              duration: totalDuration,
            });
          }
        }

        return allResults;
      },
      enabled: !facilityLoading && !!facilityData,
    });

  // Merge image check results with config results for templates
  const mergedTemplateResults = useMemo<DiagnosticResult[]>(() => {
    if (!templateImageResults) return printTemplateResults;

    const imageMap = new Map<string, DiagnosticResult>();
    const extraRows: DiagnosticResult[] = [];

    for (const ir of templateImageResults) {
      imageMap.set(ir.name, ir);
    }

    // Replace placeholder entries with real image results
    const merged = printTemplateResults.map((r) => {
      const imageResult = imageMap.get(r.name);
      if (imageResult) {
        imageMap.delete(r.name);
        return imageResult;
      }
      return r;
    });

    // Append any extra rows (e.g. print ready time summaries)
    for (const ir of imageMap.values()) {
      extraRows.push(ir);
    }

    return [...merged, ...extraRows];
  }, [printTemplateResults, templateImageResults]);

  const environmentInfo = useMemo(
    () => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      screenResolution: `${screen.width}×${screen.height}`,
      windowSize: `${window.innerWidth}×${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    // runKey forces recalculation on rerun
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runKey],
  );

  const allResults = useMemo(() => {
    const results: DiagnosticResult[] = [
      ...(printResults ?? []),
      ...configResults,
      ...mergedPluginResults,
      ...(swResult ? [swResult] : []),
      ...mergedTemplateResults,
      ...(healthResult ?? []),
      ...(mediaDeviceResults ?? []),
    ];
    if (networkResult) {
      results.push({
        name: t("api_connectivity"),
        status: networkResult.apiReachable ? "success" : "error",
        details: networkResult.latency
          ? `${networkResult.latency}ms`
          : t("unreachable"),
      });
    }
    return results;
  }, [
    printResults,
    configResults,
    mergedPluginResults,
    swResult,
    networkResult,
    mergedTemplateResults,
    healthResult,
    mediaDeviceResults,
    t,
  ]);

  const overallStatus = useMemo<ResourceStatus>(() => {
    if (allResults.some((r) => r.status === "loading")) return "loading";
    if (allResults.some((r) => r.status === "error")) return "error";
    if (allResults.some((r) => r.status === "partial")) return "partial";
    return "success";
  }, [allResults]);

  const overallProgress = useMemo(() => {
    if (allResults.length === 0) return 0;
    const doneCount = allResults.filter((r) => r.status !== "loading").length;
    return Math.round((doneCount / allResults.length) * 100);
  }, [allResults]);

  const isLoading =
    printLoading ||
    networkLoading ||
    swLoading ||
    facilityLoading ||
    healthLoading ||
    pluginsLoading ||
    mediaLoading;

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const [onlineStatus, setOnlineStatus] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setOnlineStatus(true);
    const handleOffline = () => setOnlineStatus(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const timestamp = useMemo(() => new Date(), [runKey]);

  return (
    <div
      ref={reportRef}
      id="section-to-print"
      className="space-y-6 print:space-y-4"
    >
      {/* Print-only header */}
      <div className="hidden print:block mb-6">
        <div className="flex items-center justify-between border-b border-gray-300 pb-4">
          <div>
            <h1 className="text-2xl font-bold">
              {t("system_diagnostics_report")}
            </h1>
            <p className="text-sm text-gray-500">
              {t("generated_at")}: {format(timestamp, "PPpp")}
            </p>
          </div>
          <img
            src={careConfig.mainLogo?.dark ?? "/images/care_logo.svg"}
            alt="CARE Logo"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* Controls bar - hidden when printing */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              window.history.back();
            }}
            size="icon"
          >
            <ChevronLeft className="size-4 shrink-0" />
          </Button>
          <StatusIcon status={overallStatus} />
          <div>
            <h2 className="text-lg font-semibold">{t("overall_status")}</h2>
            <p className="text-sm text-gray-500">
              {isLoading ? t("running_checks") : t("checks_complete")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={rerunAll} disabled={isLoading}>
            <RefreshCwIcon
              className={cn("size-4", isLoading && "animate-spin")}
            />
            {t("rerun")}
          </Button>
          <Button
            variant="primary"
            onClick={handlePrint}
            data-shortcut-id="print-button"
          >
            <PrinterIcon className="size-4 shrink-0" />
            {t("print_report")}
            <span className="flex rounded bg-gray-200 size-5 text-xs text-gray-600 items-center justify-center">
              P
            </span>
          </Button>
        </div>
      </div>

      <Progress value={overallProgress} className="h-2" />

      <div className="flex flex-wrap gap-2">
        <Badge variant={onlineStatus ? "green" : "destructive"}>
          <WifiIcon className="size-3 shrink-0" />
          {onlineStatus ? t("online") : t("offline")}
        </Badge>
        <Badge variant={statusBadgeVariant(overallStatus)}>
          <ActivityIcon className="size-3 shrink-0" />
          {allResults.filter((r) => r.status === "success").length}/
          {allResults.length} {t("passed")}
        </Badge>
        <Badge variant="secondary">
          <ClockIcon className="size-3 shrink-0" />
          {format(timestamp, "PPpp")}
        </Badge>
      </div>

      <DiagnosticSection
        icon={<ImageIcon className="size-5 shrink-0" />}
        title={t("printable_resources")}
        description={t("printable_resources_desc")}
      >
        <ResultsTable results={printResults ?? []} loading={printLoading} />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<LayoutTemplateIcon className="size-5 shrink-0" />}
        title={t("print_templates")}
        description={t("print_templates_desc")}
      >
        <ResultsTable
          results={mergedTemplateResults}
          loading={facilityLoading}
        />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<GlobeIcon className="size-5 shrink-0" />}
        title={t("network_diagnostics")}
        description={t("network_diagnostics_desc")}
      >
        {networkLoading ? (
          <LoadingRows count={3} />
        ) : networkResult ? (
          <div className="space-y-3">
            <ResultRow
              result={{
                name: t("api_connectivity"),
                status: networkResult.apiReachable ? "success" : "error",
                details: careConfig.apiUrl,
                duration: networkResult.latency ?? undefined,
              }}
            />
            <ResultRow
              result={{
                name: t("api_latency"),
                status:
                  networkResult.latency !== null
                    ? networkResult.latency < 300
                      ? "success"
                      : networkResult.latency < 1000
                        ? "partial"
                        : "error"
                    : "error",
                details: networkResult.latency
                  ? `${networkResult.latency}ms`
                  : t("unreachable"),
              }}
            />
            {networkResult.effectiveType && (
              <ResultRow
                result={{
                  name: t("connection_type"),
                  status:
                    networkResult.effectiveType === "4g"
                      ? "success"
                      : networkResult.effectiveType === "3g"
                        ? "partial"
                        : "error",
                  details: networkResult.effectiveType.toUpperCase(),
                }}
              />
            )}
            {networkResult.downlink !== undefined && (
              <ResultRow
                result={{
                  name: t("downlink_speed"),
                  status:
                    networkResult.downlink >= 5
                      ? "success"
                      : networkResult.downlink >= 1
                        ? "partial"
                        : "error",
                  details: `${networkResult.downlink} Mbps`,
                }}
              />
            )}
            {networkResult.rtt !== undefined && (
              <ResultRow
                result={{
                  name: t("round_trip_time"),
                  status:
                    networkResult.rtt < 100
                      ? "success"
                      : networkResult.rtt < 300
                        ? "partial"
                        : "error",
                  details: `${networkResult.rtt}ms`,
                }}
              />
            )}
            <ResultRow
              result={{
                name: t("measured_speed"),
                status:
                  networkResult.downloadSpeed !== undefined
                    ? networkResult.downloadSpeed >= 5
                      ? "success"
                      : networkResult.downloadSpeed >= 1
                        ? "partial"
                        : "error"
                    : "partial",
                details:
                  networkResult.downloadSpeed !== undefined
                    ? `${networkResult.downloadSpeed} Mbps`
                    : t("speed_unavailable"),
              }}
            />
          </div>
        ) : null}
      </DiagnosticSection>

      <DiagnosticSection
        icon={<PlugIcon className="size-5 shrink-0" />}
        title={t("plugins_and_apps")}
        description={t("plugins_and_apps_desc")}
      >
        <ResultsTable results={mergedPluginResults} loading={pluginsLoading} />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<DatabaseIcon className="size-5 shrink-0" />}
        title={t("backend_health")}
        description={t("backend_health_desc")}
      >
        <ResultsTable results={healthResult ?? []} loading={healthLoading} />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<ServerIcon className="size-5 shrink-0" />}
        title={t("configuration")}
        description={t("configuration_desc")}
      >
        <ResultsTable results={configResults} loading={false} />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<FileTextIcon className="size-5 shrink-0" />}
        title={t("services")}
        description={t("services_desc")}
      >
        <ResultsTable
          results={swResult ? [swResult] : []}
          loading={swLoading}
        />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<CameraIcon className="size-5 shrink-0" />}
        title={t("camera_and_microphone")}
        description={t("camera_and_microphone_desc")}
      >
        {mediaLoading ? (
          <LoadingRows count={3} />
        ) : mediaDeviceResults && mediaDeviceResults.length > 0 ? (
          <div className="space-y-2">
            {mediaDeviceResults
              .filter(
                (r) => r.name.startsWith(t("camera")) || r.name === t("camera"),
              )
              .map((result, i) => (
                <ResultRow key={`cam-${i}`} result={result} />
              ))}
            <Separator className="my-2" />
            {mediaDeviceResults
              .filter(
                (r) =>
                  r.name.startsWith(t("microphone")) ||
                  r.name === t("microphone"),
              )
              .map((result, i) => (
                <ResultRow key={`mic-${i}`} result={result} />
              ))}
            {mediaDeviceResults
              .filter((r) => r.name === t("media_permission_denied"))
              .map((result, i) => (
                <div
                  key={`perm-${i}`}
                  className="flex flex-col gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LockIcon className="size-4 shrink-0 text-yellow-600" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-yellow-800">
                        {result.name}
                      </span>
                      <p className="text-xs text-yellow-600 truncate">
                        {result.details}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start sm:self-auto shrink-0"
                    onClick={async () => {
                      try {
                        const stream =
                          await navigator.mediaDevices.getUserMedia({
                            video: true,
                            audio: true,
                          });
                        stream.getTracks().forEach((tr) => tr.stop());
                      } catch {
                        // User denied again — refresh will re-detect
                      }
                      refreshMediaDevices();
                    }}
                  >
                    <CameraIcon className="size-3 shrink-0" />
                    {t("grant_permission")}
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-400">
            {t("no_results")}
          </p>
        )}
      </DiagnosticSection>

      <DiagnosticSection
        icon={<VideoIcon className="size-5 shrink-0" />}
        title={t("media_tests")}
        description={t("media_tests_desc")}
      >
        <MediaTestsSection onPermissionGranted={refreshMediaDevices} />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<PrinterIcon className="size-5 shrink-0" />}
        title={t("available_printers")}
        description={t("available_printers_desc")}
      >
        <PrinterTestSection />
      </DiagnosticSection>

      <DiagnosticSection
        icon={<MonitorIcon className="size-5 shrink-0" />}
        title={t("environment")}
        description={t("environment_desc")}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(environmentInfo).map(([key, value]) => (
            <div
              key={key}
              className="flex items-start gap-2 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
            >
              <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-gray-400" />
              <div className="min-w-0">
                <span className="font-medium text-gray-700">
                  {t(`env_${key}`)}
                </span>
                <p className="break-all text-gray-500">{String(value)}</p>
              </div>
            </div>
          ))}
        </div>
      </DiagnosticSection>

      {/* Print-only footer */}
      <div className="hidden print:block mt-8 border-t border-gray-300 pt-4">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {t("system_diagnostics_report")} &bull; {format(timestamp, "PPpp")}
          </span>
          <span>{window.location.origin}</span>
        </div>
      </div>
    </div>
  );
}

function DiagnosticSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function ResultsTable({
  results,
  loading,
}: {
  results: DiagnosticResult[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading) return <LoadingRows count={3} />;
  if (results.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        {t("no_results")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {results.map((result, i) => (
        <ResultRow key={`${result.name}-${i}`} result={result} />
      ))}
    </div>
  );
}

function ResultRow({ result }: { result: DiagnosticResult }) {
  const { t } = useTranslation();
  const durationColor =
    result.duration !== undefined
      ? result.duration > 2000
        ? "text-red-500"
        : result.duration > 500
          ? "text-yellow-500"
          : "text-green-500"
      : "";

  return (
    <div className="flex flex-col gap-1 rounded-md border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between print:border-gray-300">
      <div className="flex items-center gap-2 min-w-0">
        <StatusIcon status={result.status} />
        <span className="text-sm font-medium text-gray-800 truncate">
          {result.name}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-7 sm:pl-0">
        {result.duration !== undefined && (
          <span className={cn("text-xs font-medium", durationColor)}>
            {`${result.duration}ms`}
          </span>
        )}
        {result.details && (
          <span className="max-w-40 truncate text-xs text-gray-500 sm:max-w-60">
            {result.details}
          </span>
        )}
        <Badge variant={statusBadgeVariant(result.status)} size="sm">
          {statusLabel(result.status, t)}
        </Badge>
      </div>
    </div>
  );
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex h-10 animate-pulse items-center rounded-md bg-gray-100"
        />
      ))}
    </div>
  );
}

function PrinterTestSection() {
  const { t } = useTranslation();
  const [testPrintStatus, setTestPrintStatus] = useState<
    "idle" | "printing" | "done"
  >("idle");

  const handleTestPrint = useCallback(() => {
    setTestPrintStatus("printing");

    const testWindow = window.open("", "_blank", "width=400,height=300");
    if (testWindow) {
      testWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Printer Test Page</title>
            <style>
              body { font-family: sans-serif; padding: 40px; text-align: center; }
              h1 { font-size: 24px; margin-bottom: 8px; }
              p { color: #666; font-size: 14px; }
              .box { border: 2px solid #000; padding: 20px; margin: 20px auto; max-width: 300px; }
              .patterns { display: flex; justify-content: center; gap: 8px; margin-top: 16px; }
              .patterns span { display: inline-block; width: 30px; height: 30px; }
            </style>
          </head>
          <body>
            <h1>CARE Printer Test Page</h1>
            <p>${new Date().toLocaleString()}</p>
            <div class="box">
              <p><strong>If you can read this, your printer is working correctly.</strong></p>
              <div class="patterns">
                <span style="background:#000"></span>
                <span style="background:#f00"></span>
                <span style="background:#0f0"></span>
                <span style="background:#00f"></span>
                <span style="background:#ff0"></span>
                <span style="background:#f0f"></span>
                <span style="background:#0ff"></span>
              </div>
              <p style="margin-top:12px;font-size:12px;color:#999">
                Color blocks above test color printing capability.
              </p>
            </div>
          </body>
        </html>
      `);
      testWindow.document.close();
      testWindow.focus();
      testWindow.print();
      testWindow.close();
    }

    setTimeout(() => setTestPrintStatus("done"), 2000);
    setTimeout(() => setTestPrintStatus("idle"), 5000);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex rounded-md border border-gray-100 bg-gray-50 px-3 py-2 sm:items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <PrinterIcon className="size-5 shrink-0 text-gray-500" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-800">
              {t("print_test")}
            </span>
            <p className="text-xs text-gray-500">{t("print_test_page_desc")}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start sm:self-auto shrink-0"
          onClick={handleTestPrint}
          disabled={testPrintStatus === "printing"}
        >
          {testPrintStatus === "printing" ? (
            <RefreshCwIcon className="size-3 animate-spin" />
          ) : testPrintStatus === "done" ? (
            <CheckCircle2Icon className="size-3 text-green-600" />
          ) : (
            <PrinterIcon className="size-3 shrink-0" />
          )}
          {t("test_print")}
        </Button>
      </div>

      <Separator />

      <div className="text-xs text-gray-500 px-1">
        <InfoIcon className="mr-1 inline-block size-3" />
        {t("printers_not_supported_desc")}
      </div>
    </div>
  );
}

function MediaTestsSection({
  onPermissionGranted,
}: {
  onPermissionGranted?: () => void;
}) {
  const { t } = useTranslation();

  // --- Camera preview state ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      onPermissionGranted?.();
    } catch {
      setCameraError(t("camera_access_denied"));
    }
  }, [t, onPermissionGranted]);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((tr) => tr.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  // Attach / detach stream to the video element whenever cameraStream changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Microphone test state ---
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);

  const startMic = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      onPermissionGranted?.();

      const audioCtx = new AudioContext();
      micAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(Math.round((avg / 255) * 100));
        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicError(t("microphone_access_denied"));
    }
  }, [t, onPermissionGranted]);

  const stopMic = useCallback(() => {
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    micAnalyserRef.current = null;
    micAudioCtxRef.current?.close();
    micAudioCtxRef.current = null;
    micStream?.getTracks().forEach((tr) => tr.stop());
    setMicStream(null);
    setMicLevel(0);
  }, [micStream]);

  // Clean up mic on unmount
  useEffect(() => {
    return () => {
      if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
      micAudioCtxRef.current?.close();
      micStream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Speaker test state ---
  const [speakerStatus, setSpeakerStatus] = useState<
    "idle" | "playing" | "done" | "error"
  >("idle");

  const playSpeakerTest = useCallback(() => {
    setSpeakerStatus("playing");
    try {
      // Play a short chime first, then speak "CARE is working"
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioCtx.currentTime + 0.3,
      );

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);

      oscillator.onended = () => {
        audioCtx.close();

        // Use Speech Synthesis to say "System speaker is working"
        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(
            "System speaker is working",
          );
          utterance.rate = 1;
          utterance.pitch = 1;
          utterance.volume = 1;
          utterance.onend = () => {
            setSpeakerStatus("done");
            setTimeout(() => setSpeakerStatus("idle"), 3000);
          };
          utterance.onerror = () => {
            setSpeakerStatus("done");
            setTimeout(() => setSpeakerStatus("idle"), 3000);
          };
          window.speechSynthesis.speak(utterance);
        } else {
          // Fallback: just mark as done after the chime
          setSpeakerStatus("done");
          setTimeout(() => setSpeakerStatus("idle"), 3000);
        }
      };
    } catch {
      setSpeakerStatus("error");
      setTimeout(() => setSpeakerStatus("idle"), 3000);
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Camera Preview */}
      <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CameraIcon className="size-5 text-gray-500" />
            <div>
              <span className="text-sm font-medium text-gray-800">
                {t("camera_preview")}
              </span>
              <p className="text-xs text-gray-500">
                {t("camera_preview_desc")}
              </p>
            </div>
          </div>
          {cameraStream ? (
            <Button variant="outline" size="sm" onClick={stopCamera}>
              <SquareIcon className="size-3 shrink-0" />
              {t("stop")}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={startCamera}>
              <VideoIcon className="size-3 shrink-0" />
              {t("test_camera")}
            </Button>
          )}
        </div>
        {cameraError && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
            <XCircleIcon className="size-3 shrink-0" />
            {cameraError}
          </div>
        )}
        <div
          className={cn(
            "mt-3 overflow-hidden rounded-md border border-gray-200 bg-black",
            !cameraStream && "hidden",
          )}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-48 w-full object-cover"
          />
        </div>
      </div>

      <Separator />

      {/* Microphone Test */}
      <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
        <div className="flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <MicIcon className="size-5 shrink-0 text-gray-500" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-800">
                {t("microphone_test")}
              </span>
              <p className="text-xs text-gray-500">{t("mic_test_desc")}</p>
            </div>
          </div>
          {micStream ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start sm:self-auto shrink-0"
              onClick={stopMic}
            >
              <SquareIcon className="size-3 shrink-0" />
              {t("stop")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="self-start sm:self-auto shrink-0"
              onClick={startMic}
            >
              <MicIcon className="size-3 shrink-0" />
              {t("test_microphone")}
            </Button>
          )}
        </div>
        {micError && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
            <XCircleIcon className="size-3 shrink-0" />
            {micError}
          </div>
        )}
        {micStream && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{t("mic_level")}</span>
              <span
                className={cn(
                  "font-medium",
                  micLevel > 50
                    ? "text-green-600"
                    : micLevel > 15
                      ? "text-yellow-600"
                      : "text-gray-400",
                )}
              >
                {micLevel}%
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-75",
                  micLevel > 50
                    ? "bg-green-500"
                    : micLevel > 15
                      ? "bg-yellow-500"
                      : "bg-gray-400",
                )}
                style={{ width: `${micLevel}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{t("mic_test_listening")}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Speaker Test */}
      <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
        <div className="flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Volume2Icon className="size-5 shrink-0 text-gray-500" />
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-800">
                {t("speaker")}
              </span>
              <p className="text-xs text-gray-500">{t("speaker_test_desc")}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="self-start sm:self-auto shrink-0"
            onClick={playSpeakerTest}
            disabled={speakerStatus === "playing"}
          >
            {speakerStatus === "playing" ? (
              <RefreshCwIcon className="size-3 animate-spin" />
            ) : speakerStatus === "done" ? (
              <CheckCircle2Icon className="size-3 text-green-600" />
            ) : speakerStatus === "error" ? (
              <XCircleIcon className="size-3 text-red-600" />
            ) : (
              <PlayIcon className="size-3 shrink-0" />
            )}
            {speakerStatus === "playing"
              ? t("speaker_test_playing")
              : speakerStatus === "done"
                ? t("speaker_test_done")
                : speakerStatus === "error"
                  ? t("speaker_test_failed")
                  : t("test_speaker")}
          </Button>
        </div>
      </div>
    </div>
  );
}
