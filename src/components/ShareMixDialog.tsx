import React, { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import type { FavoriteCombo } from '@/services/favoritesService';
import { getPublicProfile } from '@/services/profileService';
import { submitUserMix } from '@/services/userMixService';
import {
  USER_MIX_DESCRIPTION_MAX, USER_MIX_NAME_MAX, userMixFromFavorite, validateUserMixInput,
} from '@/services/userMixes';

interface Props {
  favorite: FavoriteCombo | null;
  uid: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export const ShareMixDialog: React.FC<Props> = ({ favorite, uid, onClose, onSubmitted }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setName(''); setDescription(''); onClose(); };

  const submit = async () => {
    if (!favorite) return;
    const problem = validateUserMixInput({ name, description });
    if (problem) { toast({ title: problem, variant: 'destructive' }); return; }

    setBusy(true);
    try {
      // Read from the profile, not the auth user: the rule compares against
      // profiles/{uid}.displayName, so this is the value that will pass.
      const displayName = (await getPublicProfile(uid))?.displayName;
      if (!displayName) {
        toast({ title: 'Set a display name first', description: 'Your mix is credited to you by name.', variant: 'destructive' });
        return;
      }
      const submission = userMixFromFavorite(favorite, { name, description }, { uid, displayName });
      if (!submission) {
        toast({ title: 'Only custom builds can be shared', variant: 'destructive' });
        return;
      }
      await submitUserMix(submission);
      toast({ title: 'Submitted for review', description: 'The bar will take a look before it goes on the menu.' });
      onSubmitted();
      close();
    } catch {
      toast({ title: 'Could not submit your mix', description: 'Check your connection and try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={favorite !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share as a mix</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mix-name">Name</Label>
            <Input id="mix-name" value={name} maxLength={USER_MIX_NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mix-description">Description (optional)</Label>
            <Input
              id="mix-description" value={description} maxLength={USER_MIX_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
