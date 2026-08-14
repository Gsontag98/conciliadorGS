import { BaseEdge, getBezierPath } from '@xyflow/react';

export default function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style }) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  
  const getColor = () => {
    if (!data) return '#64748b';
    switch(data.pass) {
      case 1: case 2: return '#22c55e';
      case 3: case 4: return '#3b82f6';
      case 5: return '#f59e0b';
      case 7: return '#a855f7';
      default: return '#64748b';
    }
  };
  
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{
        ...style,
        stroke: getColor(),
        strokeWidth: 2,
        strokeDasharray: '5,5',
        animation: 'dash 1s linear infinite',
      }} />
      {data && data.confidence && (
        <foreignObject
          width={40}
          height={20}
          x={(sourceX + targetX) / 2 - 20}
          y={(sourceY + targetY) / 2 - 10}
          style={{ overflow: 'visible' }}
        >
          <div style={{
            background: getColor(),
            color: 'white',
            fontSize: '0.6rem',
            fontWeight: 700,
            padding: '2px 5px',
            borderRadius: 6,
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
          }}>
            {data.confidence}%
          </div>
        </foreignObject>
      )}
    </>
  );
}
