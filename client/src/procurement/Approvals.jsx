import { useAdminData } from '../admin/shared.jsx';
import { money } from './shared.jsx';

// Manager queue: only requests that are still Pending.
export function Approvals({ onExpired, onReview }) {
  const queue = useAdminData('/requests/queue', onExpired);
  const requests = queue.data?.requests ?? [];
  return <section className="panel"><div className="panel-heading"><h2>Approvals</h2><button type="button" onClick={() => queue.reload()}>Refresh</button></div>
    <p>Pending requests only. Review opens Approve and Reject.</p>
    {queue.error && <p className="error" role="alert">{queue.error}</p>}
    {queue.loading && <p role="status">Loading the queue…</p>}
    {!queue.loading && !queue.error && <><p className="result-count">{requests.length} pending request{requests.length === 1 ? '' : 's'}</p><div className="table-scroll"><table>
      <thead><tr><th>Request</th><th>Requester</th><th>Department</th><th>Date</th><th>Estimated total</th><th></th></tr></thead>
      <tbody>{requests.map(request => <tr key={request.requestId}><td><strong>#{request.requestId}</strong></td><td>{request.requester}</td><td>{request.departmentName}</td><td>{request.requestDate}</td><td>{money(request.estimatedTotal)}</td><td><button onClick={() => onReview(request.requestId)}>Review</button></td></tr>)}</tbody>
    </table>{!requests.length && <p className="empty-state">Nothing is waiting for approval.</p>}</div></>}
  </section>;
}
