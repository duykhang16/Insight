import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '../../context/LanguageContext';

const UnsavedChangesModal = ({ open, onClose, onDiscard, changeSummary = [] }) => {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg">
            {t('admin.zones.unsaved_title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('admin.zones.unsaved_description')}
          </DialogDescription>
        </DialogHeader>

        {/* Change summary list */}
        {changeSummary.length > 0 && (
          <div className="rounded-lg border border-foreground/10 bg-muted/50 p-3 space-y-1.5 max-h-48 overflow-y-auto">
            {changeSummary.map((change, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="shrink-0 mt-0.5">📌</span>
                <span>{change}</span>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            {t('admin.zones.unsaved_leave')}
          </Button>
          <Button variant="default" onClick={onClose}>
            {t('admin.zones.unsaved_stay')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnsavedChangesModal;
