import * as types from '@babel/types';
import { NodePath } from 'babel-traverse';
import { Program, ImportDeclaration, ImportNamespaceSpecifier, ImportSpecifier, ImportDefaultSpecifier } from 'babel-types';
import { name2source } from 'nejm/nejmap';

export { isModule } from 'babel-helper-module-transforms';
export { NodePath, Program };

interface NEJDefine {
    source: string;
    name?: string;
}

export interface Options {
    extName?: string;
    alias?: { [key: string]: string };
}

export interface NEJModules {
    nejDefines: NEJDefine[];
    fnBody: any[];
    returnStatement: any;
}


const TEXT_MODULR_RE = /\.html$|\.css$|\.json$/;
enum MODULE_TYPE {
    nej,
    text,
    custorm
}

const escape = (str: string) => {
    const excape = /(\/|{|}|\.)/g;
    return str.replace(excape, '\\' + '$1')
};

const genAliasRe = (alias: { [key: string]: string }): RegExp => {
    const reStr = [];

    for (const key in alias) {
        reStr.push(`^${escape(key)}`);
    }

    return new RegExp(reStr.join('|'));
};

const transformImports = (importList: ImportDeclaration[], { alias, extName }: Options): NEJDefine[] => {
    const aliasRe = genAliasRe(alias);
    let extNameRe: RegExp;
    if (extName) {
        extNameRe = new RegExp(escape(extName));
    }

    const _transform = (source: string, specifiers: any[], type: MODULE_TYPE): NEJDefine[] => {
        const result: NEJDefine[] = [];

        switch (type) {
            case MODULE_TYPE.nej:
                specifiers.forEach((specifier) => {
                    result.push({
                        source: name2source[(specifier as ImportSpecifier).imported.name],
                        name: (specifier as ImportSpecifier).local.name
                    })
                });

                break;
            case MODULE_TYPE.text:
                specifiers.forEach((specifier) => {
                    if (source.endsWith('.json')) {
                        source = 'json!' + source;
                    } else {
                        source = 'text!' + source;
                    }

                    result.push({
                        source,
                        name: (specifier as ImportNamespaceSpecifier).local.name
                    })
                });

                break;
            case MODULE_TYPE.custorm:
                if (!specifiers.length) { // 处理单纯的 import 语句
                    specifiers.push(null);
                }

                specifiers.forEach((specifier) => {
                    // 处理自定义的后缀名
                    if (extNameRe) {
                        source = source.replace(extNameRe, '');
                    }

                    // 处理 alias
                    let _result = source.match(aliasRe);
                    if (_result) {
                        source = source.replace(_result[0], alias[_result[0]]);
                    }

                    // 相对路径添加 .js 尾缀
                    if (source.startsWith('.') && !source.endsWith('.js')) {
                        source += '.js';
                    }

                    result.push({
                        source,
                        name: specifier ? (specifier as ImportDefaultSpecifier).local.name : null
                    })
                });

                break;
        }

        return result;
    };

    let result: NEJDefine[] = [];

    importList.forEach(impd => {
        const { source, specifiers } = impd;
        let sourceName = source.value;
        let defines: NEJDefine[];

        if (sourceName === 'nejm') {
            defines = _transform(sourceName, specifiers, MODULE_TYPE.nej);
        } else if (TEXT_MODULR_RE.test(sourceName)) {
            defines = _transform(sourceName, specifiers, MODULE_TYPE.text);
        } else {
            defines = _transform(sourceName, specifiers, MODULE_TYPE.custorm);
        }

        result = result.concat(defines);
    });

    return result;
};

const defaultOptions: Options = {
    extName: '',
    alias: {}
};

export const helper = (path: NodePath, opts: Options = {}): NEJModules => {
    opts = Object.assign(defaultOptions, opts);

    const { node } = path;
    const importList = [];
    const fnBody = [];
    const exportList = [];
    const returnStatement = [];

    (node as Program).body.forEach(statement => {
        if (types.isImportDeclaration(statement)) {
            importList.push(statement);
        } else if (types.isExportDefaultDeclaration(statement) || types.isExportDefaultSpecifier(statement)) {
            // TODO: 添加所有的 export 类型, 暂时只支持 export default
            exportList.push(statement);
        } else {
            fnBody.push(statement);
        }
    });

    return {
        nejDefines: transformImports(importList, opts),
        fnBody,
        returnStatement
    }
};
