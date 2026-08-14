import { Handle, Position } from '@xyflow/react';

const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(val);

const formatDate = (dateStr) => {
  if (dateStr && dateStr.includes('-')) {
    return dateStr.split('-').reverse().join('/');
  }
  return dateStr || '';
};

export default function SupplierNode({ data }) {
  // data: { amount, date, description, matched, matchPass }
  return (
    <div className={`custom-node supplier ${data.matched ? 'matched' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header">
        <span className="node-type">FORNECEDOR</span>
      </div>
      <div className="node-amount">{formatCurrency(data.amount)}</div>
      <div className="node-date">{formatDate(data.date)}</div>
      <div className="node-desc" title={data.description}>{data.description}</div>
    </div>
  );
}
