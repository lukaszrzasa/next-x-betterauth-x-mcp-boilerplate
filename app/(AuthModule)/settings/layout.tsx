import { SettingsNavigation } from "@/app/(AuthModule)/_/components/settings/SettingsNavigation";

/**
 * The shared frame of the settings pages, centred at a reading width: title
 * and page navigation, rendered outside each page's own loading and error
 * boundaries. This is
 * presentation only; every page enforces its own access and enrollment
 * guard, and every operation checks again.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui:mx-auto ui:flex ui:w-full ui:max-w-[64rem] ui:flex-col ui:gap-6">
      <SettingsNavigation />
      {children}
    </div>
  );
}
