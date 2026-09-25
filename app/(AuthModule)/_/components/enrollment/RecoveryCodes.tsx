"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { Card, CardContent } from "@/src/components/ui/card";
import { FieldDescription, FieldGroup } from "@/src/components/ui/field";

export function RecoveryCodes({
  codes,
  onContinue,
}: {
  codes: string[];
  onContinue: () => void;
}) {
  const [codesSaved, setCodesSaved] = useState(false);

  return (
    <FieldGroup>
      <FieldDescription>
        Your authenticator is ready. Save these recovery codes somewhere safe:
        each one can replace your authenticator code once when signing in.
      </FieldDescription>
      <Card className="ui:bg-muted">
        <CardContent>
          <ul className="ui:grid ui:list-none ui:grid-cols-2 ui:gap-3 ui:p-0 ui:text-sm">
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <FieldDescription>
        These codes are shown only now. You will still need your account
        password to use them.
      </FieldDescription>
      <div className="ui:flex ui:items-start ui:gap-3">
        <Checkbox
          id="codes-saved"
          checked={codesSaved}
          onCheckedChange={(checked) => setCodesSaved(checked === true)}
        />
        <Label htmlFor="codes-saved" className="ui:leading-relaxed">
          I have saved my recovery codes in a safe place.
        </Label>
      </div>
      <Button className="ui:h-11" disabled={!codesSaved} onClick={onContinue}>
        Continue to panel
      </Button>
    </FieldGroup>
  );
}
