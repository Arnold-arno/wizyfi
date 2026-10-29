import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  customersApi, cyclesApi,
  type CustomerInput, type CustomerStatus, type CycleStatus, type NetworkCycleInput,
} from "../../lib/api/directoryApi";
import { useSessionStore } from "../../state/sessionStore";

const useOrgId = () => useSessionStore((s) => s.activeOrganizationId);

export function useCustomers(params: { page?: number; search?: string; status?: CustomerStatus }) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["directory", "customers", orgId, params],
    queryFn: () => customersApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerInput) => customersApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["directory", "customers"] }),
  });
}

export function useCycles(params: { page?: number; place?: string; status?: CycleStatus }) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["directory", "cycles", orgId, params],
    queryFn: () => cyclesApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}

export function useCreateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NetworkCycleInput) => cyclesApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["directory", "cycles"] }),
  });
}

export function useDeleteCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cyclesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["directory", "cycles"] }),
  });
}
