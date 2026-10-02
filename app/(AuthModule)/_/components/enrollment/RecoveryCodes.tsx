"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("auth.enrollment.recoveryCodes");
  const [codesSaved, setCodesSaved] = useState(false);

  return (
    <FieldGroup>
      <FieldDescription>{t("intro")}</FieldDescription>
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
      <FieldDescription>{t("note")}</FieldDescription>
      <div className="ui:flex ui:items-start ui:gap-3">
        <Checkbox
          id="codes-saved"
          checked={codesSaved}
          onCheckedChange={(checked) => setCodesSaved(checked === true)}
        />
        <Label htmlFor="codes-saved" className="ui:leading-relaxed">
          {t("saved")}
        </Label>
      </div>
      <Button className="ui:h-11" disabled={!codesSaved} onClick={onContinue}>
        {t("continue")}
      </Button>
    </FieldGroup>
  );
}
