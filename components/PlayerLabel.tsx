/** Players celebrating tonight - a cake follows their name everywhere it shows. */
const BIRTHDAYS = ["irene"];

function CakeIcon() {
  return (
    <svg
      width="0.9em"
      height="0.9em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="birthday"
      className="ml-1 inline-block align-[-0.1em] text-clay"
    >
      <path d="M4 21h16" />
      <path d="M5 21v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6" />
      <path d="M5 16.5c1.2 1.2 2.3 1.2 3.5 0s2.3-1.2 3.5 0 2.3 1.2 3.5 0 2.3-1.2 3.5 0" />
      <path d="M12 13V9" />
      <path d="M12 3.5c-1 1.2-1 2.3 0 3.2 1-.9 1-2 0-3.2Z" fill="currentColor" />
    </svg>
  );
}

/** A player's name, with the birthday cake when it is their night. */
export function PlayerLabel({ name }: { name: string }) {
  const party = BIRTHDAYS.includes(name.trim().toLowerCase());
  return (
    <>
      {name}
      {party && <CakeIcon />}
    </>
  );
}
