<script>
  const communities = [
    {
      label: 'Mindbuilding Discord',
      displayUrl: 'discord.gg/brain',
      href: 'https://discord.gg/brain',
    },
  ]
</script>

<footer class="flex h-7 shrink-0 items-center justify-center border-t border-base-300 bg-base-100 text-base-content">
  <nav aria-label="Discord communities" class="flex items-center gap-1.5">
    {#each communities as community (community.href)}
      <span class="group relative flex">
        <a
          href={community.href}
          target="_blank"
          rel="noopener noreferrer"
          class="flex h-5 w-5 items-center justify-center rounded-sm opacity-55 hover:bg-[#5865f2]/15 hover:text-[#5865f2] hover:opacity-100 focus-visible:bg-[#5865f2]/15 focus-visible:text-[#5865f2] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5865f2]"
          aria-label={`${community.label}: ${community.displayUrl}`}
          title={`${community.label}: ${community.displayUrl}`}
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515c-.074.136-.159.315-.194.458a18.27 18.27 0 0 0-7.67 0 6.2 6.2 0 0 0-.195-.458A19.74 19.74 0 0 0 2.49 4.37C-.654 9.046-.321 13.58.106 18.058a19.9 19.9 0 0 0 5.993 3.03 14.24 14.24 0 0 0 1.535-2.126 12.93 12.93 0 0 1-2.42-1.162c.203-.149.4-.303.592-.464a13.99 13.99 0 0 0 12.385 0c.192.16.389.315.592.464a12.92 12.92 0 0 1-2.42 1.162 14.24 14.24 0 0 0 1.535 2.126 19.9 19.9 0 0 0 5.993-3.03c.5-5.177-.838-9.674-3.574-13.688ZM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.42s.955-2.419 2.157-2.419c1.213 0 2.177 1.096 2.157 2.42 0 1.333-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42s.955-2.419 2.157-2.419c1.213 0 2.177 1.096 2.157 2.42 0 1.333-.944 2.419-2.157 2.419Z"
            />
          </svg>
        </a>
        <span
          role="tooltip"
          class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-base-300 bg-base-200 px-2 py-1 text-[0.65rem] opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >{community.label}: {community.displayUrl}</span>
      </span>
    {/each}
  </nav>
</footer>
