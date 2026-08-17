// AppConfigModule se importa desde su propio fichero, no desde aquí.
//
// Su decorador @Module ejecuta ConfigModule.forRoot() al cargarse, y eso valida el
// entorno en tiempo de importación. Si este barrel lo reexportara, cualquier fichero
// que solo quisiera TypedConfigService arrastraría esa validación y reventaría en un
// test o en un script que no tiene por qué tener un .env delante.
export * from './env-files';
export * from './env.schema';
export * from './typed-config.service';
