import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/app/auth-context';
import { errorMessage } from '@/lib/api';

export function useStartDemo() {
  const { startDemo } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<'student' | 'parent' | null>(null);

  const start = async (persona: 'student' | 'parent' = 'student') => {
    setPending(persona);
    try {
      await startDemo(persona);
      navigate(persona === 'parent' ? '/parent' : '/dashboard');
      toast.success('Demo started', { description: 'You’re viewing a fictional district with simulated buses.' });
    } catch (e) {
      toast.error('Couldn’t start the demo', { description: errorMessage(e) });
    } finally {
      setPending(null);
    }
  };

  return { start, pending };
}
