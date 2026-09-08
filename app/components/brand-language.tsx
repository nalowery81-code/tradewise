'use client'

import { useEffect } from 'react'

const replaceConversationalBrand = (value: string) =>
  value.replace(/Ask CraftCompass AI/g, 'Ask CraftCompass')

export default function BrandLanguage() {
  useEffect(() => {
    const updateNode = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()

      while (node) {
        if (node.nodeValue?.includes('Ask CraftCompass AI')) {
          node.nodeValue = replaceConversationalBrand(node.nodeValue)
        }
        node = walker.nextNode()
      }

      if ('querySelectorAll' in root) {
        root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[placeholder*="Ask CraftCompass AI"]').forEach((element) => {
          element.placeholder = replaceConversationalBrand(element.placeholder)
        })
      }
    }

    updateNode(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData' && mutation.target.nodeValue?.includes('Ask CraftCompass AI')) {
          mutation.target.nodeValue = replaceConversationalBrand(mutation.target.nodeValue)
        }

        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) updateNode(node as Element)
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue?.includes('Ask CraftCompass AI')) {
            node.nodeValue = replaceConversationalBrand(node.nodeValue)
          }
        })
      }
    })

    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}
