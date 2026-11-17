import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type LoginType = 'PHONE' | 'EMAIL';

/** Only offer login types confirmed available by the server. */
export function useLoginMethods(order: LoginType[] = ['PHONE', 'EMAIL']) {
  const methods = useQuery({
    queryKey: ['auth-methods'],
    queryFn: () =>
      api<{ email: boolean; phone: boolean; supportEmail: string | null }>('/auth/methods'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const offered = order.filter((type) =>
    type === 'PHONE' ? (methods.data?.phone ?? false) : (methods.data?.email ?? false),
  );
  return { offered, supportEmail: methods.data?.supportEmail ?? null, methods };
}
