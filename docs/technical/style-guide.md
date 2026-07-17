# 编码规范

本项目 Java 代码遵循 [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)。本文档摘录与项目相关的重要约定，并补充 Spring Boot / MyBatis Plus 生态下的额外约束。

任何代码评审、IDE 自动格式化、CI 检查均以本文档与 Google 官方指南为准；冲突时以 Google 官方为准。

## 1. 缩进与格式

- **缩进**：2 空格；禁止使用 Tab。
- **行宽**：单行不超过 100 字符。
- **括号**：K&R 风格——左括号不换行，右括号独占一行（除非与开始符号同行）。
- **空行**：类内成员分组之间留一行空行；方法体内逻辑段之间留一行空行。

## 2. 命名约定

| 元素 | 风格 | 示例 |
|---|---|---|
| 包名 | 全小写，连字符不用 | `com.ai.travel` |
| 类 / 接口 / 枚举 / 注解 | `PascalCase` | `ItineraryAiService`, `TaskStatus` |
| 方法 / 变量 / 参数 | `camelCase` | `submitGenerateTask`, `taskId` |
| 常量 | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| 泛型类型参数 | 单大写字母 | `<T>`, `<K, V>` |
| 布尔变量 / 方法 | 以 `is` / `has` / `can` 开头 | `isTerminal()`, `hasResult()` |

## 3. 修饰符顺序

按以下顺序排列（同一修饰符出现多次只写一次）：

```
public / protected / private
abstract
static
final
transient
volatile
synchronized
native
strictfp
```

## 4. 成员顺序

类内成员按以下顺序排列，相邻分组之间留一行空行：

1. 静态字段（`public` → `private`）
2. 实例字段（`public` → `private`）
3. 构造函数
4. 方法（`public` → `protected` → 包内 → `private`）
5. 嵌套类 / 接口

## 5. 导入

- 禁止通配符导入（`import java.util.*;`）。
- 按 ASCII 顺序排序。
- 静态导入单独成块，位于非静态导入之前。
- 同一包内的类不需要 import。

## 6. Javadoc

### 6.1 类级 Javadoc

每个 public 类与 public 枚举必须有类级 Javadoc，第一句为简短摘要（不需句号结尾），可加 `<p>` 段落补充说明。

```java
/**
 * 异步任务实体，对应 itinerary_task 表。
 *
 * <p>典型生命周期：PENDING → PROCESSING → COMPLETED / FAILED / CANCELLED。
 */
```

### 6.2 字段 Javadoc

实体字段使用单行 `/** ... */`，注明含义、单位、可空性。

```java
/** 出行天数，≥1。 */
private Integer days;

/** 响应状态，可选值: SUCCESS, PARTIAL, FAILED。 */
private String responseStatus;
```

### 6.3 方法 Javadoc

public / protected 方法必须有 Javadoc，必须包含 `@param`、`@return`（有返回值时）、`@throws`（声明的业务异常）。多参数或复杂方法用 `<p>` 段落补充前置条件、副作用、并发说明。

**强制要求**：所有新增的 public / protected 方法、工具类方法、拦截器、配置类均必须配备 Javadoc。私有辅助方法在逻辑复杂时也应添加简要注释。禁止出现无注释的 public 方法。

```java
/**
 * 查询任务当前状态与结果。
 *
 * @param taskId 任务 ID
 * @return 任务状态响应
 * @throws RuntimeException 当任务不存在时抛出
 */
public TaskStatusResponse getStatus(String taskId) { ... }
```

## 7. 异常处理

- 禁止仅 `catch (Exception e) { log.error(...); }` 后吞掉——必须明确说明为什么可以忽略。
- 持久化等"不影响主流程"的辅助异常，必须在 catch 块上方注释中显式说明。
- 不要捕获 `Throwable` / `Error`；`InterruptedException` 捕获后必须 `Thread.currentThread().interrupt()`。
- 抛出异常时优先使用业务自定义异常，框架原生 `RuntimeException` 仅用于非业务场景。

## 8. 项目特定约束

### 8.1 枚举优先

- 业务状态（任务状态、调用类型、POI 分类等）一律使用枚举，禁止硬编码字符串字面量。
- 枚举字段应配套 `@JsonValue`（输出）与 `@JsonCreator`（反序列化）保证 Jackson 序列化稳定，避免依赖 ordinal。
- 终态判断、类型分发等行为封装在枚举自身（如 `TaskStatus.isTerminal()`），禁止在业务代码中用字符串 OR 比较。

### 8.2 MyBatis Plus 实体

- 实体类使用 Lombok `@Data`，禁止手写 getter/setter。
- 主键策略通过 `@TableId(type = ...)` 显式声明，避免依赖全局默认。
- 字段映射优先依赖下划线 ↔ 驼峰自动推断，避免冗余 `@TableField`。
- 时间字段建议配合 `FieldFill.INSERT` 自动填充，避免依赖数据库默认值（跨库不一致）。
- 枚举字段入库使用 `EnumTypeHandler`（MyBatis Plus 默认支持），不要手动转换字符串。

### 8.3 Spring Boot 控制器

- 控制器层只做参数校验、转发、响应包装，不放业务逻辑。
- 请求 DTO 使用 `@Valid` + `@NotBlank` / `@NotNull` / `@Min` 等约束。
- 返回值统一使用 `ApiResponse<T>` 包装，禁止直接返回实体或裸 JSON。
- 路径变量、查询参数命名与字段保持一致（`taskId` 对应 `{taskId}`）。
- **Swagger 注解**：所有控制器类必须使用 `@Tag(name, description)` 标注模块分组；所有接口方法必须使用 `@Operation(summary, description)` 描述功能；使用 `@ApiResponse` 声明可能的响应码和含义；DTO 类使用 `@Schema(description)` 标注字段含义和示例值。密码等敏感字段必须标记 `accessMode = Schema.AccessMode.WRITE_ONLY`。

### 8.4 工具库使用

- 时间处理：Hutool `DateUtil`，避免手写 `LocalDateTime.now().plusHours(...)`。
- UUID 生成：`IdUtil.fastSimpleUUID()`，比 `UUID.randomUUID()` 更快。
- 字符串截断：`StrUtil.maxLength(s, n)`，避免手写三元表达式。
- 集合拼接：`CollUtil.join(list, separator)`，避免手写 `String.join`。

## 9. 工具支持

### 9.1 IDE 配置

- **IntelliJ IDEA**：导入 Google 官方 [`intellij-java-google-style.xml`](https://github.com/google/styleguide/blob/gh-pages/intellij-java-google-style.xml)，设为项目默认 Code Style。
- **VS Code**：使用 `google-java-format` 扩展，保存时自动格式化。
- **命令行**：`google-java-format` 提供 `mvn fmt:format` 与 CI 检查脚本。

### 9.2 Checkstyle（计划）

`pom.xml` 初始化时一并加入 `maven-checkstyle-plugin`，使用 Google 官方 `google_checks.xml`：

```bash
mvn checkstyle:check
```

> 注：当前阶段尚无 `pom.xml`，Checkstyle 配置在 Step 1 项目初始化时补齐。

## 10. 参考

- [Google Java Style Guide（官方英文）](https://google.github.io/styleguide/javaguide.html)
- [Google Java Format（自动格式化工具）](https://github.com/google/google-java-format)
- [Checkstyle Google Style 配置](https://github.com/checkstyle/checkstyle/blob/master/src/main/resources/google_checks.xml)
- [阿里巴巴 Java 开发手册（中文补充参考）](https://github.com/alibaba/p3c)