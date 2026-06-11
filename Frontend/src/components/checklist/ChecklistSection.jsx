import CheckGroup from './CheckGroup'

export default function ChecklistSection({ groups, parsedUrl, revealed, result }) {
  return (
    /* space-y-5 = 20px gap between groups — clear visual separation */
    <div className="space-y-5">
      {groups.map((group, idx) => (
        <CheckGroup
          key={group.id}
          group={group}
          parsedUrl={parsedUrl}
          revealed={revealed}
          result={result}
          isLastGroup={idx === groups.length - 1}
        />
      ))}
    </div>
  )
}
