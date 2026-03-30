import React, { useState } from 'react';
import { AlertTriangle, Loader2, Server, Users } from 'lucide-react';
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

const DeleteZoneModal = ({ zone, open, onClose, onConfirm }) => {
  const { t } = useLanguage();
  const [deleting, setDeleting] = useState(false);

  const siteCount = zone?.site_ids?.length ?? zone?.site_count ?? 0;
  const memberCount = zone?.members?.length ?? zone?.member_count ?? 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm(zone.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !deleting) onClose(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!deleting}>
        <DialogHeader>
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-amber-500 animate-pulse" />
            </div>
          </div>
          <DialogTitle className="text-center text-lg">
            {t('admin.zones.delete_title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('admin.zones.delete_zone_name').replace('{name}', zone?.name || '')}
          </DialogDescription>
        </DialogHeader>

        {/* Impact details */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-foreground/80">
            <Server className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{t('admin.zones.delete_impact_sites').replace('{count}', siteCount)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-foreground/80">
            <Users className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{t('admin.zones.delete_impact_members').replace('{count}', memberCount)}</span>
          </div>
        </div>

        <p className="text-sm text-destructive text-center font-medium">
          {t('admin.zones.delete_warning')}
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleting}
          >
            {t('admin.zones.delete_cancel_btn')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
            {deleting ? t('admin.zones.deleting') : t('admin.zones.delete_confirm_btn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteZoneModal;
