"use client";

import { useId, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { DataTableToolbar } from "@/src/components/data-table/DataTableToolbar";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import {
  clearUsersFilters,
  hasUsersFilters,
  withUsersQueryChange,
} from "@/app/(AuthModule)/admin/_/queryState";
import {
  USER_ROLE_FILTERS,
  USERS_SEARCH_MAX_LENGTH,
  type SortDirection,
  type UserRoleFilter,
  type UserSort,
  type UserStatusFilter,
  type UserVerifiedFilter,
} from "@/app/(AuthModule)/admin/_/schema";
import type { UsersQuery } from "@/app/(AuthModule)/admin/_/types";
import { ROLE_LABELS } from "@/app/(AuthModule)/admin/_/components/users/UserBadges";

/** `all` plus every declared role, labelled from the one role-label table. */
const ROLE_OPTIONS: { value: UserRoleFilter; label: string }[] = USER_ROLE_FILTERS.map((value) => ({
  value,
  label: value === "all" ? "All roles" : ROLE_LABELS[value],
}));

const VERIFIED_OPTIONS: { value: UserVerifiedFilter; label: string }[] = [
  { value: "all", label: "Any verification" },
  { value: "yes", label: "Verified" },
  { value: "no", label: "Unverified" },
];

const STATUS_OPTIONS: { value: UserStatusFilter; label: string }[] = [
  { value: "all", label: "Any access" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
];

/** The sort control's vocabulary: one value per sort/direction pair. */
export const SORT_OPTIONS: { value: `${UserSort}:${SortDirection}`; label: string }[] = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "email:asc", label: "Email A–Z" },
  { value: "email:desc", label: "Email Z–A" },
];

export type UsersFiltersProps = {
  query: UsersQuery;
  pending: boolean;
  /** Filters, sort and clear: pushed immediately. */
  onChange: (next: UsersQuery) => void;
  /** Search text: debounced by the caller. */
  onSearchChange: (next: UsersQuery) => void;
  /** Enter in the search field: apply what was typed now. */
  onSearchSubmit: () => void;
};

export function UsersFilters({
  query,
  pending,
  onChange,
  onSearchChange,
  onSearchSubmit,
}: UsersFiltersProps) {
  const ids = {
    search: useId(),
    role: useId(),
    verified: useId(),
    status: useId(),
    sort: useId(),
  };
  const [search, setSearch] = useState(query.q);
  const [shownQuery, setShownQuery] = useState(query.q);

  // Back/Forward (or a canonical redirect) changed the URL: show its search
  // text. Adjusted during render, the way React documents for derived state.
  if (shownQuery !== query.q) {
    setShownQuery(query.q);
    setSearch(query.q);
  }

  const filtered = hasUsersFilters(query);

  return (
    <DataTableToolbar
      search={
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit();
          }}
        >
          <Label htmlFor={ids.search} className="ui:sr-only">
            Search users
          </Label>
          <div className="ui:relative">
            <SearchIcon
              aria-hidden="true"
              className="ui:pointer-events-none ui:absolute ui:top-1/2 ui:left-3 ui:size-4 ui:-translate-y-1/2 ui:text-muted-foreground"
            />
            <Input
              id={ids.search}
              type="search"
              value={search}
              maxLength={USERS_SEARCH_MAX_LENGTH}
              placeholder="Search by name, email or ID"
              autoComplete="off"
              className="ui:pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                onSearchChange(withUsersQueryChange(query, { q: event.target.value.trim() }));
              }}
            />
          </div>
        </form>
      }
      filters={
        <>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.role} className="ui:text-xs ui:text-muted-foreground">
              Role
            </Label>
            <NativeSelect
              id={ids.role}
              value={query.role}
              disabled={pending}
              onChange={(event) =>
                onChange(withUsersQueryChange(query, { role: event.target.value as UserRoleFilter }))
              }
            >
              {ROLE_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.verified} className="ui:text-xs ui:text-muted-foreground">
              Email verification
            </Label>
            <NativeSelect
              id={ids.verified}
              value={query.verified}
              disabled={pending}
              onChange={(event) =>
                onChange(
                  withUsersQueryChange(query, { verified: event.target.value as UserVerifiedFilter }),
                )
              }
            >
              {VERIFIED_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.status} className="ui:text-xs ui:text-muted-foreground">
              Access
            </Label>
            <NativeSelect
              id={ids.status}
              value={query.status}
              disabled={pending}
              onChange={(event) =>
                onChange(
                  withUsersQueryChange(query, { status: event.target.value as UserStatusFilter }),
                )
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="ui:flex ui:flex-col ui:gap-1.5">
            <Label htmlFor={ids.sort} className="ui:text-xs ui:text-muted-foreground">
              Sort by
            </Label>
            <NativeSelect
              id={ids.sort}
              value={`${query.sort}:${query.direction}`}
              disabled={pending}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(":") as [UserSort, SortDirection];
                onChange(withUsersQueryChange(query, { sort, direction }));
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </>
      }
      actions={
        filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onChange(clearUsersFilters(query))}
          >
            <XIcon aria-hidden="true" />
            Clear filters
          </Button>
        ) : undefined
      }
    />
  );
}
