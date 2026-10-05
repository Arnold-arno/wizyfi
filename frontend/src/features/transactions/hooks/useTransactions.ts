import { useQuery } from "@tanstack/react-query";
import { transactionsApi, type TransactionListParams } from "../../../lib/api/salesApi";
import { useSessionStore } from "../../../state/sessionStore";

export function useTransactions(params: TransactionListParams) {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  return useQuery({
    queryKey: ["transactions", orgId, params],
    queryFn: () => transactionsApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}
