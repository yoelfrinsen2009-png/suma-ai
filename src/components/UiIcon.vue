<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number; strokeWidth?: number }>(), {
  size: 18,
  strokeWidth: 1.8,
});
</script>

<template>
  <svg :class="`ui-icon icon-${name}`" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'home'"><path d="m3 11 9-8 9 8"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></template>
    <template v-else-if="name === 'chat'"><path d="M5 18.5 3.5 21l4.2-1.2c1.3.8 2.7 1.2 4.3 1.2 4.7 0 8.5-3.4 8.5-7.5S16.7 6 12 6s-8.5 3.4-8.5 7.5c0 1.9.6 3.6 1.5 5Z"/><path d="M8 13h8M8 16h5"/></template>
    <template v-else-if="name === 'chart'"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/><path d="M2 20h22"/></template>
    <template v-else-if="name === 'list'"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></template>
    <template v-else-if="name === 'compass'"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"/></template>
    <template v-else-if="name === 'headset'"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z"/><path d="M17 20c0 1-1 2-3 2"/></template>
    <template v-else-if="name === 'activity'"><path d="M4 4v16M20 4v16"/><path d="M8 8h8M8 16h8"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="16" r="1.5"/></template>
    <template v-else-if="name === 'bell'"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></template>
    <path v-else-if="name === 'chevron'" d="m7 10 5 5 5-5"/>
    <template v-else-if="name === 'menu'"><path d="M4 7h16M4 12h16M4 17h16"/></template>
    <template v-else-if="name === 'close'"><path d="m6 6 12 12M18 6 6 18"/></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14"/></template>
    <template v-else-if="name === 'grid'"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></template>
    <path v-else-if="name === 'check'" d="m5 12 4 4L19 6"/>
    <template v-else-if="name === 'refresh'"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></template>
    <template v-else-if="name === 'search'"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></template>
    <path v-else-if="name === 'paperclip'" d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9"/>
    <template v-else-if="name === 'table'"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 4v16"/></template>
    <template v-else-if="name === 'cloud'"><path d="M16 16h2a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1.5A4.5 4.5 0 0 0 7.5 16H10"/><path d="m12 12 0 8m-3-3 3 3 3-3"/></template>
    <template v-else-if="name === 'send'"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></template>
    <template v-else-if="name === 'voice'"><path d="M4 10v4M8 7v10M12 3v18M16 7v10M20 10v4"/></template>
    <template v-else-if="name === 'download'"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/></template>
    <template v-else-if="name === 'compare'"><path d="M7 3v14M3 13l4 4 4-4M17 21V7M13 11l4-4 4 4"/></template>
    <template v-else-if="name === 'copy'"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></template>
    <template v-else-if="name === 'database'"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></template>
    <template v-else-if="name === 'shield'"><path d="M12 3 20 6v5c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-5"/></template>
    <template v-else-if="name === 'users'"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></template>
    <template v-else-if="name === 'trash'"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14M14 7l5 5-5 5"/></template>
    <template v-else><path d="m12 3 1.1 4.1L17 8.2l-3.9 1.1L12 13l-1.1-3.7L7 8.2l3.9-1.1L12 3Z"/><path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z"/></template>
  </svg>
</template>
