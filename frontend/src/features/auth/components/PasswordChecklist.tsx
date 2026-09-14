import { PASSWORD_RULES } from "../constants/password-policy";
import { cn } from "@/lib/utils";

type PasswordChecklistProps = {
  password: string;
};

// Live "as you type" hint — see specs/auth-pages.md ("/register") for why
// this duplicates backend rules client-side. Purely a UX hint: the backend
// response on submit remains the actual gate (see RegisterForm).
export default function PasswordChecklist({ password }: PasswordChecklistProps) {
  if (!password) return null;

  return (
    <ul className="flex flex-col gap-1">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.code}
            className={cn(
              "flex items-center gap-2 font-sans text-xs transition-colors",
              met ? "text-primary" : "text-text-muted"
            )}
          >
            <span aria-hidden="true">{met ? "✓" : "○"}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
