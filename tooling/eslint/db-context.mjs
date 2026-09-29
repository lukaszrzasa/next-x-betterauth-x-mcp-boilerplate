import ts from "typescript";

const inDb = (file) => /\/_\/db\//.test(file.replaceAll("\\", "/"));

/** Check the public import boundary, not persistence's private collaboration. */
const dbContextRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      context: "DB function '{{name}}' must require a branded Ctx as its first parameter when imported outside _/db.",
    },
  },
  create(context) {
    if (inDb(context.filename)) return {};
    const services = context.sourceCode.parserServices;
    const checker = services.program.getTypeChecker();

    function branded(type) {
      if (type.isUnion()) return type.types.every(branded);
      if (type.flags & ts.TypeFlags.TypeParameter) {
        const constraint = checker.getBaseConstraintOfType(type);
        return constraint ? branded(constraint) : false;
      }
      return type.getProperties().some((property) =>
        property.declarations?.some((declaration) =>
          declaration.name?.getText() === "#brand" &&
          declaration.getSourceFile().fileName.replaceAll("\\", "/").endsWith("/src/lib/auth/builders/context/ctx.ts"),
        ),
      );
    }

    function check(symbol, node, seen = new Set()) {
      if (!symbol || seen.has(symbol)) return;
      seen.add(symbol);
      if (symbol.flags & ts.SymbolFlags.Alias) {
        if (symbol.declarations?.every((declaration) =>
          ts.isExportSpecifier(declaration) &&
          (declaration.isTypeOnly || declaration.parent.parent.isTypeOnly),
        )) return;
        check(checker.getAliasedSymbol(symbol), node, seen);
        return;
      }
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (!declaration) return;
      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      const signatures = type.getCallSignatures();
      if (inDb(declaration.getSourceFile().fileName) && signatures.length) {
        const valid = signatures.every((signature) => {
          const first = signature.parameters[0];
          const parameter = first?.valueDeclaration;
          return parameter && !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken &&
            branded(checker.getTypeOfSymbolAtLocation(first, parameter));
        });
        if (!valid) context.report({ node, messageId: "context", data: { name: symbol.name } });
      }
      // Namespace imports, barrels, and exported objects cannot hide a helper.
      for (const property of type.getProperties()) {
        if (property.declarations?.some((item) => inDb(item.getSourceFile().fileName))) {
          check(property, node, seen);
        }
      }
      if (symbol.flags & ts.SymbolFlags.Module) {
        for (const member of checker.getExportsOfModule(symbol)) check(member, node, seen);
      }
    }

    function module(node, source) {
      check(checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(source)), node);
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") return;
        for (const specifier of node.specifiers) {
          if (specifier.importKind === "type") continue;
          if (specifier.type === "ImportNamespaceSpecifier") module(specifier, node.source);
          else check(checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(specifier.local)), specifier);
        }
      },
      ExportNamedDeclaration(node) {
        if (!node.source || node.exportKind === "type") return;
        for (const specifier of node.specifiers) {
          if (specifier.exportKind !== "type") {
            check(checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(specifier.exported)), specifier);
          }
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== "type") module(node, node.source);
      },
      ImportExpression(node) { module(node, node.source); },
    };
  },
};

export default dbContextRule;
