import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface Facility {
  id: string;
  [key: string]: unknown;
}

interface DiagnosticsNavigationButtonProps {
  facility?: Facility;
  facilityId?: string;
}

export default function DiagnosticsNavigationButton({
  facility,
  facilityId,
}: DiagnosticsNavigationButtonProps) {
  const { t } = useTranslation();
  const id = facility?.id || facilityId;

  if (!id) {
    return null;
  }

  const handleClick = () => {
    window.location.href = `/facility/${id}/settings/diagnostics`;
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      className="w-full sm:w-auto justify-start p-2"
      size="sm"
    >
      <Activity className="size-3 shrink-0" />
      {t("system_diagnostics")}
    </Button>
  );
}
