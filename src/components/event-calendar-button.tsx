import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createCalendarFile, googleCalendarUrl, type CalendarEvent } from "@/lib/event-calendar";

export function EventCalendarButton({ event }: { event: CalendarEvent }) {
  function download() {
    try {
      const blob = new Blob([createCalendarFile(event)], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evento-${event.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error((error as Error).message); }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" className="no-print"><CalendarPlus /> Adicionar ao calendário</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem asChild><a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer"><ExternalLink /> Google Agenda</a></DropdownMenuItem>
        <DropdownMenuItem onSelect={download}><Download /> Apple / Outlook (.ics)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}