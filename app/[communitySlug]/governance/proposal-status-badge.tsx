import { ProposalStatus } from '@/lib/api/types';

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const colors: Record<ProposalStatus, { bg: string; text: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-800' },
    active: { bg: 'bg-blue-100', text: 'text-blue-800' },
    closed: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    resolved: { bg: 'bg-green-100', text: 'text-green-800' },
  };

  const colors_class = colors[status];

  return (
    <span className={`${colors_class.bg} ${colors_class.text} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
