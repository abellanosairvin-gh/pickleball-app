# Pickleball Session Tracker

An app an organizer uses to run a pickleball open-play event: roster, matchup generation, score logging, and a public read-only spectator view reached by QR code.

## Language

**Session**:
One real-world play event (a date, a set of courts, a roster) created and run by the Organizer. Only one Session is active at a time; all queues, games, and standings belong to it.
_Avoid_: Event, night, meetup

**Organizer**:
The single authenticated operator of the app. Enters the roster, generates the schedule, logs scores. There is exactly one Organizer login.
_Avoid_: Admin, host

**Player**:
A named participant in a Session, entered by the Organizer, with a Rating and a gender. Exists only within a Session (no cross-session identity).
_Avoid_: User, member

**Out**:
A Player tag meaning "done for the night" (injury, early leave) without leaving the roster: no new Games are generated for them, they skip the tournament playoffs, but their played results stay on the Leaderboard. Reversible. Their queued Games are flagged for the Organizer to clear, then top up.
_Avoid_: Injured, inactive, removed

**Checked in**:
A Player tag meaning they have arrived and can play tonight. Off by default; the Organizer sets it from the roster. A Game can't start until all four of its Players are checked in - when it is up next with a Court open, it shows red instead of ready. Organizer-only: the Spectator View never shows it.
_Avoid_: Present, arrived, attendance

**Rating**:
A Player's self-declared skill tier: Beginner, Mid, or Advanced. Beginner and Advanced may never appear in the same Game in any role; Mid may play with anyone.
_Avoid_: Level, skill, rank

**Game**:
One doubles matchup: two teams of two Players, played on a Court, ending in a single final score pair (played to 11, unvalidated, no ties). The only unit of play — there are no multi-game matches.
_Avoid_: Match, round

**Schedule**:
The full ordered list of a Session's Games, pre-generated up front and editable by the Organizer at any time.
_Avoid_: Bracket, rotation

**Queue**:
The not-yet-started portion of the Schedule, in play order.
_Avoid_: Up next, pipeline

**Game Cap**:
The hard maximum number of Games each Player plays in a Session — one number, the same for every Player. Once a Player reaches it, they are done for the event.
_Avoid_: Quota, target, games-per-player

**Matchup Mode**:
How Games are formed: Random, Rating-based, Manual (hand-built by the Organizer), or Ladder. Modes can be mixed within one Session.
_Avoid_: Format, algorithm

**Ladder**:
A Matchup Mode where results drive the matchups: after each Game, the winners join the winners pool and the losers (plus Players yet to play) join the losers pool; four free pool-mates form the next Game. Results trump the rating and gender rules; the Game Cap still applies.
_Avoid_: King of the court, bracket

**Gender Balance Rule**:
A hard constraint on every generated Game in a Tournament Session: both teams have the same gender make-up - MM vs MM, MF vs MF, or FF vs FF. Never MM vs FF or MF vs FF. Non-tournament Sessions are genderless - any four Players can share a Game in any split. Hand-picked (Fixed) Games are the Organizer's override and may use any split in any Session. (Ladder mode and tournament brackets draw their own pairs and are exempt.)
_Avoid_: Mixed rule

**Court**:
A numbered playing surface (1..N, count set per Session) that hosts at most one in-progress Game at a time.

**Leaderboard**:
Per-Session standings covering the whole event: wins, losses, points scored, points given up, and +/- per Player, sorted by wins, then losses, then +/-. Counts regular Games only, up to the Game Cap; Tournament bracket Games never count (their outcome is shown on the championship ladder).
_Avoid_: Standings, rankings

**Spectator View**:
The anonymous, mobile-friendly, read-only page reached via a Session's QR code: current Games by Court, the Queue, the Leaderboard, and Game history.
_Avoid_: Public view, guest mode
