// Honest placeholder for modules that belong to later phases. No fake behaviour.
import { h } from '../utils/dom.js';

export function placeholder(title, phase, desc) {
  return root => root.append(
    h('h2', {}, title),
    h('div', { class: 'notice' }, h('strong', {}, 'Chưa triển khai. '), `Module này thuộc ${phase}. ${desc}`));
}
