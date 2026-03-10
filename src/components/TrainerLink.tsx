import { Link } from "react-router-dom";

interface TrainerLinkProps {
  trainerId: string;
  name: string;
  className?: string;
}

export function TrainerLink({ trainerId, name, className = "" }: TrainerLinkProps) {
  return (
    <Link
      to={`/trainers/${trainerId}`}
      className={`text-primary hover:underline cursor-pointer ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </Link>
  );
}
