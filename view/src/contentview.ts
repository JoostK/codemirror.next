declare global {
  interface Node { cmView: ContentView | undefined; cmIgnore: boolean | undefined }
}

export const enum dirty { not = 0, child = 1, node = 2 }

export abstract class ContentView {
  constructor(public parent: ContentView | null, public dom: Node | null) {
    if (dom) dom.cmView = this
  }

  abstract length: number;
  abstract children: ContentView[];
  dirty: number = dirty.not;

  get childGap() { return 0 }
  get overrideDOMText(): string | null { return null }

  get posAtStart(): number {
    return this.parent ? this.parent.posBefore(this) : 0
  }

  get posAtEnd(): number {
    return this.posAtStart + this.length
  }

  posBefore(view: ContentView): number {
    let pos = this.posAtStart
    for (let child of this.children) {
      if (child == view) return pos
      pos += child.length + this.childGap
    }
    throw new RangeError("Invalid child in posBefore")
  }

  posAfter(view: ContentView): number {
    return this.posBefore(view) + view.length
  }

  syncDOMChildren() {
    if (!this.dom) return
    let dom = this.dom.firstChild
    for (let view of this.children) {
      let childDOM = view.dom
      if (!childDOM) continue
      if (childDOM.parentNode == this.dom) {
        while (childDOM != dom) dom = rm(dom!)
        dom = dom.nextSibling
      } else {
        this.dom.insertBefore(childDOM, dom)
      }
    }
    while (dom) dom = rm(dom)
  }

  sync() {
    if (this.dirty & dirty.node)
      this.syncDOMChildren()
    if (this.dirty & dirty.child)
      for (let child of this.children) if (child.dirty) child.sync()
    this.dirty = dirty.not
  }

  domFromPos(pos: number): {node: Node, offset: number} | null { return null }

  localPosFromDOM(node: Node, offset: number): number {
    let after: Node | null
    if (node == this.dom) {
      after = this.dom.childNodes[offset]
    } else {
      let bias = !node.firstChild ? 0 : offset == 0 ? -1 : 1
      for (;;) {
        let parent = node.parentNode!
        if (parent == this.dom) break
        if (bias == 0 && parent.firstChild != parent.lastChild) {
          if (node == parent.firstChild) bias = -1
          else bias = 1
        }
        node = parent
      }
      if (bias < 0) after = node
      else after = node.nextSibling
    }
    while (after && !after.cmView) after = after.nextSibling
    if (!after) return this.length

    for (let i = 0, pos = 0;; i++) {
      let child = this.children[i]
      if (child.dom == after) return pos
      pos += child.length + this.childGap
    }
  }

  // FIXME track precise dirty ranges, to avoid full DOM sync on every touched node?
  markDirty() {
    if (this.dirty & dirty.node) return
    this.dirty |= dirty.node
    for (let parent = this.parent; parent; parent = parent.parent) {
      if (parent.dirty & dirty.child) return
      parent.dirty |= dirty.child
    }
  }
}

// Remove a DOM node and return its next sibling.
function rm(dom: Node): Node {
  let next = dom.nextSibling
  dom.parentNode!.removeChild(dom)
  return next!
}

export class ChildCursor {
  off: number = 0

  constructor(public children: ContentView[], public pos: number,
              public gap: number = 0, public i: number = children.length) {
    this.pos += gap
  }

  findPos(pos: number, bias: number = 1): this {
    for (;;) {
      if (pos > this.pos || pos == this.pos && (bias > 0 || this.i == 0)) {
        this.off = pos - this.pos
        return this
      }
      this.pos -= this.children[--this.i].length + this.gap
    }
  }
}