import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export type LoginType = 'PHONE' | 'EMAIL';

/** Login types the server can deliver codes for. Until it answers (or if it can't), offer both; the server still explains a refusal. */
export function useLoginMethods(order: LoginType[] = ['PHONE', 'EMAIL']) {
  const methods = useQuery({
    queryKey: ['auth-methods'],
    queryFn: () => api<{ email: boolean; phone: boolean }>('/auth/methods'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const offered = order.filter((type) =>
    type === 'PHONE' ? (methods.data?.phone ?? true) : (methods.data?.email ?? true),
  );
  return { offered, phoneOff: methods.data?.phone === false };
}
