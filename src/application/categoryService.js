'use strict';

const { ConflictError, NotFoundError, ValidationError } = require('../domain/errors');
const { validateCategory } = require('../domain/rules/validation');

class CategoryService {
  constructor({ categories, clock, bus }) {
    this.categories = categories;
    this.clock = clock;
    this.bus = bus;
  }

  list({ includeInactive = false } = {}) {
    return this.categories.list({ includeInactive });
  }

  create(input) {
    const data = validateCategory(input);
    this.assertNameAvailable(data.name, null);
    const id = this.categories.insert(data, this.clock.now());
    this.bus.emit('data-changed', { entity: 'category', id });
    return this.categories.getById(id);
  }

  update(id, input) {
    const existing = this.categories.getById(id);
    if (!existing) throw new NotFoundError('Categoria não encontrada.');
    const data = validateCategory(input);
    if (data.isActive) this.assertNameAvailable(data.name, id);
    this.categories.update(id, data);
    this.bus.emit('data-changed', { entity: 'category', id });
    return this.categories.getById(id);
  }

  /**
   * Exclui a categoria. Se houver lembretes associados, ela é apenas
   * desativada para preservar a integridade dos dados.
   */
  remove(id) {
    const existing = this.categories.getById(id);
    if (!existing) throw new NotFoundError('Categoria não encontrada.');
    let archived = false;
    if (this.categories.countReferences(id) > 0) {
      this.categories.setActive(id, false);
      archived = true;
    } else {
      this.categories.remove(id);
    }
    this.bus.emit('data-changed', { entity: 'category', id });
    return { archived };
  }

  assertNameAvailable(name, ignoreId) {
    const clash = this.categories.findActiveByName(name);
    if (clash && clash.id !== ignoreId) {
      throw new ConflictError('Já existe uma categoria ativa com esse nome.');
    }
  }

  /** Garante que a categoria informada existe e está ativa. */
  assertUsable(categoryId) {
    if (categoryId === null) return;
    const category = this.categories.getById(categoryId);
    if (!category || !category.isActive) throw new ValidationError('Categoria inválida ou inativa.', 'categoryId');
  }
}

module.exports = { CategoryService };
