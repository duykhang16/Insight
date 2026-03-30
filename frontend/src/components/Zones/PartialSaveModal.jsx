import React from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '../../context/LanguageContext';

const PartialSaveModal = ({ open, onClose, onSavePartial, onCancelAll, results, saving = false }) => {
  const { t } = useLanguage();

  const successCount = results?.filter(r => r.ok)?.length ?? 0;
  const failedResults = results?.filter(r => !r.ok) ?? [];
  const failCount = failedResults.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            {t('admin.zones.partial_title')}
          </DialogTitle>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex items-center justify-center gap-3">
          <Badge variant="default" className="gap-1.5 px-3 py-1 text-sm bg-emerald-600 text-white">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('admin.zones.partial_success_count').replace('{count}', successCount)}
          </Badge>
          <Badge variant="destructive" className="gap-1.5 px-3 py-1 text-sm">
            <XCircle className="w-3.5 h-3.5" />
            {t('admin.zones.partial_fail_count').replace('{count}', failCount)}
          </Badge>
        </div>

        {/* Failed details */}
        {failedResults.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1.5 max-h-48 overflow-y-auto">
            {failedResults.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <span>
                  <strong>{r.label}</strong> — {r.error}
                </span>
              </div>
            ))}
          </div>
        )}

        <DialogDescription className="text-center">
          {t('admin.zones.partial_question')
            .replace('{success}', successCount)
            .replace('{fail}', failCount)}
        </DialogDescription>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelAll} disabled={saving}>
            {t('admin.zones.partial_cancel')}
          </Button>
          <Button variant="default" onClick={onSavePartial} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {t('admin.zones.partial_confirm').replace('{count}', successCount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PartialSaveModal;
