<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  content: string
  streaming?: boolean
}>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div class="markdown-wrap">
    <div class="markdown-body" v-html="html" />
    <span v-if="streaming" class="cursor">|</span>
  </div>
</template>

<style lang="scss" scoped>
.markdown-wrap {
  display: inline;
}

.markdown-body {
  :deep(p) {
    margin: 0 0 0.6em;
    &:last-child { margin-bottom: 0; }
  }
  :deep(ul), :deep(ol) {
    margin: 0.4em 0 0.6em;
    padding-left: 1.4em;
  }
  :deep(li) { margin-bottom: 0.25em; }
  :deep(code) {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.06);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  :deep(pre) {
    margin: 0.6em 0;
    padding: 10px 12px;
    background: #1e1e1e;
    color: #e8e8e8;
    border-radius: 8px;
    overflow-x: auto;
    code { background: none; padding: 0; color: inherit; }
  }
  :deep(blockquote) {
    margin: 0.5em 0;
    padding-left: 12px;
    border-left: 3px solid #d4ebe3;
    color: #666;
  }
  :deep(a) {
    color: #07c160;
    text-decoration: underline;
  }
  :deep(h1), :deep(h2), :deep(h3) {
    margin: 0.6em 0 0.4em;
    font-size: 1em;
    font-weight: 700;
  }
}

.cursor {
  animation: blink 0.8s infinite;
  font-weight: 300;
}
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
</style>
