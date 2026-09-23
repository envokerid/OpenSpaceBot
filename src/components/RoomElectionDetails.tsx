import type { RoomElectionData } from "../../shared/room-election";

export function RoomElectionDetails({ election }: { election: RoomElectionData }) {
  return <details className="mt-3 border-t border-hairline/40 pt-2 text-[12px]">
    <summary role="button" className="cursor-pointer font-medium text-ink">Proposals and judge · {election.rounds.length} rounds</summary>
    <div className="mt-2 max-h-96 space-y-4 overflow-y-auto">
      {election.rounds.map(round => {
        const name = (id: string) => id === "task_complete" ? "Task complete" : round.members.find(m => m.id === id)?.name ?? id;
        return <div key={round.round}>
          <p className="font-semibold">Round {round.round}{round.superseded ? " · Superseded by new context" : round.winner ? ` · ${name(round.winner)}` : ""}</p>
          {(["proposals", "votes"] as const).filter(phase => phase === "proposals" || round.votes.length > 0).map(phase => <div key={phase} className="mt-2">
            <p className="font-medium text-ink-secondary">{phase === "proposals" ? "Proposals" : "Votes"}</p>
            {round[phase].map((choice, index) => <div key={choice.botId} className="mt-1 rounded-lg bg-inset p-2">
              <p className="font-medium">{name(choice.botId)} → {name(choice.candidate)}</p>
              {choice.reason && <p className="whitespace-pre-wrap text-ink-secondary">{choice.reason}</p>}
              {phase === "votes" && round.constrainedChoices && index === round.members.length - 1 && <p className="mt-1 text-ink-secondary">Final vote restricted to prevent a tie.</p>}
            </div>)}
          </div>)}
          {round.judge && <div className="mt-2 rounded-lg bg-inset p-2">
            <p className="font-semibold">Judge · {round.judge.selection.model}</p>
            <p>{round.judge.candidate ? `Selected: ${name(round.judge.candidate)}` : "Awaiting decision"}</p>
            {round.judge.reason && <p className="whitespace-pre-wrap text-ink-secondary">{round.judge.reason}</p>}
          </div>}
        </div>;
      })}
    </div>
  </details>;
}
